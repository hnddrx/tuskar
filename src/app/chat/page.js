"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Hash, ArrowLeft, MessagesSquare } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import PageHeader from "@/components/PageHeader";
import { ROOM_CONVERSATION, groupMessages } from "@/lib/chat";

// Only while the tab is actually being looked at — a backgrounded tab should
// not keep polling.
const POLL_MS = 4000;

function SidebarSection({ label }) {
  return (
    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
      {label}
    </p>
  );
}

function ConversationRow({ conversation, label, active, onSelect }) {
  const isRoom = conversation.kind === "room";
  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
        active ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
      }`}
    >
      {isRoom ? (
        <Hash size={15} className="shrink-0 text-slate-400" />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
          {initials(label)}
        </span>
      )}
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          conversation.unread > 0
            ? "font-semibold text-slate-900 dark:text-slate-100"
            : "text-slate-700 dark:text-slate-300"
        }`}
      >
        {label}
      </span>
      {conversation.unread > 0 && (
        <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          {conversation.unread}
        </span>
      )}
    </button>
  );
}

function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDay(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function ChatPage() {
  const {
    team: { orgId, orgName },
  } = useTasks();

  const [state, setState] = useState(null); // { userId, members, conversations }
  const [active, setActive] = useState(ROOM_CONVERSATION);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  // Mobile shows one pane at a time.
  const [showList, setShowList] = useState(true);

  const bottomRef = useRef(null);
  // The newest message we already hold, so a poll asks only for what's after it.
  const cursorRef = useRef(null);

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/state");
      if (!res.ok) return;
      setState(await res.json());
    } catch {
      /* a failed refresh just means stale counts until the next poll */
    }
  }, []);

  const loadMessages = useCallback(async (conversationId, { reset = false } = {}) => {
    const since = reset ? null : cursorRef.current;
    const params = new URLSearchParams({ conversation: conversationId });
    if (since) params.set("since", since);

    const res = await fetch(`/api/chat/messages?${params}`);
    if (!res.ok) {
      if (reset) setError("This conversation isn't available.");
      return;
    }
    const batch = await res.json();
    if (batch.length > 0) cursorRef.current = batch[batch.length - 1].createdAt;

    setMessages((prev) => {
      if (reset) return batch;
      if (batch.length === 0) return prev;
      // A message we just sent optimistically arrives again from the server.
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...batch.filter((m) => !seen.has(m.id))];
    });
  }, []);

  // Switching conversation resets the cursor and marks it read. Clearing
  // here is the point of the effect — showing the previous conversation's
  // messages under a new header, even briefly, would be worse than a blank
  // moment. It runs once per switch, so it cannot cascade.
  useEffect(() => {
    if (!orgId) return;
    cursorRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setError(null);
    loadMessages(active, { reset: true });
    fetch("/api/chat/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: active }),
    })
      .then(loadState)
      .catch(() => {});
  }, [active, orgId, loadMessages, loadState]);

  // Poll, but only while the tab is visible.
  useEffect(() => {
    if (!orgId) return;
    let timer = null;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      await loadMessages(active);
      await loadState();
    };
    const start = () => {
      stop();
      timer = setInterval(tick, POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, orgId, loadMessages, loadState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const grouped = useMemo(() => groupMessages(messages), [messages]);
  const conversations = state?.conversations || [];
  const activeConversation = conversations.find((c) => c.id === active);

  // Split the way Odoo's Discuss does: a channel and a private conversation
  // are different kinds of thing, and an undifferentiated list gives no clue
  // which is which.
  const channels = conversations.filter((c) => c.kind === "room");
  const directMessages = conversations.filter((c) => c.kind === "dm");

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: active, body }),
      });
      if (!res.ok) throw new Error("Message not sent");
      const saved = await res.json();
      cursorRef.current = saved.createdAt;
      setMessages((prev) => [...prev, saved]);
      setDraft("");
    } catch (err) {
      setError(err.message || "Message not sent");
    } finally {
      setSending(false);
    }
  }

  if (!orgId) {
    return (
      <div className="flex-1">
        <PageHeader title="Chat" subtitle="Talk to your team." />
        <p className="px-4 py-6 text-sm text-slate-500 sm:px-8 dark:text-slate-400">
          Chat lives in a team. Pick or create one from the switcher above the
          navigation to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Chat"
        subtitle={`Talk to ${orgName || "your team"} — in the shared room or one to one.`}
      />

      <div className="px-4 py-6 sm:px-8">
        <div className="flex h-[calc(100vh-16rem)] min-h-[26rem] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {/* Conversations */}
          <aside
            className={`w-full shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-800 sm:block sm:w-60 ${
              showList ? "block" : "hidden"
            }`}
          >
            <SidebarSection label="Channels" />
            {channels.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                label={orgName || "Team"}
                active={c.id === active}
                onSelect={() => {
                  setActive(c.id);
                  setShowList(false);
                }}
              />
            ))}

            <SidebarSection label="Direct messages" />
            {directMessages.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                Nobody else on this team yet.
              </p>
            )}
            {directMessages.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                label={c.name}
                active={c.id === active}
                onSelect={() => {
                  setActive(c.id);
                  setShowList(false);
                }}
              />
            ))}
          </aside>

          {/* Thread */}
          <section className={`flex min-w-0 flex-1 flex-col ${showList ? "hidden sm:flex" : "flex"}`}>
            <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
              <button
                onClick={() => setShowList(true)}
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 sm:hidden dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Back to conversations"
              >
                <ArrowLeft size={16} />
              </button>
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                {activeConversation?.kind === "dm"
                  ? activeConversation.name
                  : orgName || "Team"}
              </span>
            </header>

            <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
              {grouped.length === 0 && (
                <p className="flex items-center gap-2 py-6 text-sm text-slate-400 dark:text-slate-500">
                  <MessagesSquare size={15} /> No messages yet — say something.
                </p>
              )}
              {grouped.map((m) => (
                <div key={m.id}>
                  {m.startsDay && (
                    <div className="my-3 flex items-center gap-3">
                      <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">
                        {formatDay(m.createdAt)}
                      </span>
                      <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                    </div>
                  )}
                  <div className={`flex gap-2.5 ${m.showHeader ? "mt-3" : ""}`}>
                    <div className="w-7 shrink-0">
                      {m.showHeader && (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                          {initials(m.author)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {m.showHeader && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                            {m.authorUserId === state?.userId ? "You" : m.author}
                          </span>
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">
                            {formatTime(m.createdAt)}
                          </span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">
                        {m.body}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {error && (
              <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                {error}
              </p>
            )}

            <form
              onSubmit={send}
              className="flex items-end gap-2 border-t border-slate-200 px-3 py-2.5 dark:border-slate-800"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends; Shift+Enter is a newline.
                  if (e.key === "Enter" && !e.shiftKey) send(e);
                }}
                rows={1}
                placeholder="Type a message…"
                className="max-h-32 min-w-0 flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
              >
                <Send size={14} />
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

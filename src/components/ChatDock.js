"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { MessageCircle, Hash, X, ArrowLeft } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useConversation } from "@/lib/useConversation";
import ChatMessages, { initials, PresenceDot } from "@/components/ChatMessages";
import ChatComposer from "@/components/ChatComposer";

/**
 * The floating chat widget: one bubble in the corner that expands into a
 * single panel.
 *
 * The panel shows either the list of conversations or one conversation, with
 * a back arrow between them — a conversation opens inside the widget rather
 * than as a separate window beside it, so there is only ever one floating
 * thing on screen and the bubble's badge is the single place unread is
 * reported.
 */
export default function ChatDock() {
  const { enabled, panelOpen, activeId, totalUnread, togglePanel, closePanel } = useChat();
  const ref = useRef(null);

  // Escape closes the panel; a click outside does not, so the panel survives
  // working on the page behind it.
  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  if (!enabled) return null;

  return (
    <div
      ref={ref}
      className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2"
    >
      {panelOpen && (
        <div className="flex h-[70vh] max-h-[32rem] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:w-80">
          {activeId ? <ConversationView /> : <ConversationList />}
        </div>
      )}

      <button
        onClick={togglePanel}
        aria-label={totalUnread > 0 ? `Messages (${totalUnread} unread)` : "Messages"}
        aria-expanded={panelOpen}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {panelOpen ? <X size={20} /> : <MessageCircle size={20} />}
        {totalUnread > 0 && !panelOpen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-slate-900">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>
    </div>
  );
}

function ConversationList() {
  const { conversations, members, serverNow, open, closePanel } = useChat();

  // Unread first, then most recently active.
  const ordered = [...conversations].sort((a, b) => {
    if ((b.unread || 0) !== (a.unread || 0)) return (b.unread || 0) - (a.unread || 0);
    return String(b.lastAt || "").localeCompare(String(a.lastAt || ""));
  });

  return (
    <>
      <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Messages
        </span>
        <div className="flex items-center gap-2">
          <Link
            href="/chat"
            onClick={closePanel}
            className="text-[11px] text-slate-500 transition-colors hover:underline dark:text-slate-400"
          >
            Open Chat →
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {ordered.length === 0 && (
          <p className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500">
            No conversations yet.
          </p>
        )}
        {ordered.map((c) => {
          const isRoom = c.kind === "room";
          const person = c.withUserId ? members.find((m) => m.id === c.withUserId) : null;
          return (
            <button
              key={c.id}
              onClick={() => open(c.id)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              {isRoom ? (
                <Hash size={15} className="shrink-0 text-slate-400" />
              ) : (
                <span className="relative shrink-0">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {initials(c.name)}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <PresenceDot lastSeenAt={person?.lastSeenAt} now={serverNow} />
                  </span>
                </span>
              )}
              <span
                className={`min-w-0 flex-1 truncate text-sm ${
                  c.unread > 0
                    ? "font-semibold text-slate-900 dark:text-slate-100"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {c.name}
              </span>
              {c.unread > 0 && (
                <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
                  {c.unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

function ConversationView() {
  const { activeId, conversations, members, serverNow, userId, back, closePanel, markRead } =
    useChat();
  const { messages, sending, send } = useConversation(activeId, { active: true });

  const conversation = conversations.find((c) => c.id === activeId);
  const person = conversation?.withUserId
    ? members.find((m) => m.id === conversation.withUserId)
    : null;

  async function handleSend(body, attachment) {
    const ok = await send(body, attachment);
    if (ok) markRead(activeId);
    return ok;
  }

  return (
    <>
      <header className="flex items-center gap-1.5 border-b border-slate-200 px-2 py-2 dark:border-slate-800">
        <button
          onClick={back}
          aria-label="Back to conversations"
          className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={16} />
        </button>
        {conversation?.kind === "dm" && (
          <PresenceDot lastSeenAt={person?.lastSeenAt} now={serverNow} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
          {conversation?.name || "Conversation"}
        </span>
        <button
          onClick={closePanel}
          aria-label="Close messages"
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X size={15} />
        </button>
      </header>

      <ChatMessages messages={messages} currentUserId={userId} compact />
      <ChatComposer onSend={handleSend} sending={sending} compact />
    </>
  );
}

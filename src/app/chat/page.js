"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Hash, ArrowLeft, Plus, Loader2, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useChat } from "@/context/ChatContext";
import { useConversation } from "@/lib/useConversation";
import { dmConversationId } from "@/lib/chat";
import ChatMessages, { initials, PresenceDot } from "@/components/ChatMessages";
import ChatComposer from "@/components/ChatComposer";
import { CHAT_PARAM } from "@/lib/teamScope";

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex-1 p-8 text-sm text-slate-400 dark:text-slate-500">Loading…</div>}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const {
    userId,
    members,
    serverNow,
    conversations,
    markRead,
    refresh,
  } = useChat();

  const searchParams = useSearchParams();
  const requested = searchParams.get(CHAT_PARAM);

  const [active, setActive] = useState(requested || null);
  // On a phone the list and the conversation share the screen; arriving with
  // a conversation named should land on it, not on the list.
  const [showList, setShowList] = useState(!requested);
  const [composing, setComposing] = useState(false);

  // Following another team's link while already on this page.
  useEffect(() => {
    if (!requested) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(requested);
    setShowList(false);
  }, [requested]);

  // Land on the first conversation once the list arrives.
  useEffect(() => {
    if (!active && conversations.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActive(conversations[0].id);
    }
  }, [active, conversations]);

  useEffect(() => {
    if (active) markRead(active);
  }, [active, markRead]);

  const { messages, sending, send } = useConversation(active, { active: Boolean(active) });

  const channels = conversations.filter((c) => c.kind === "room");
  const directMessages = conversations.filter((c) => c.kind === "dm");
  const current = conversations.find((c) => c.id === active);
  const person = current?.withUserId
    ? members.find((m) => m.id === current.withUserId)
    : null;

  async function handleSend(body, attachment) {
    const ok = await send(body, attachment);
    if (ok) markRead(active);
    return ok;
  }

  function startWith(user) {
    setActive(dmConversationId(userId, user.id));
    setShowList(false);
    setComposing(false);
    refresh();
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Chat"
        subtitle="Your teams' rooms and direct messages. Direct messages stay with you whichever team you're in."
      />

      <div className="px-4 py-6 sm:px-8">
        <div className="flex h-[calc(100vh-16rem)] min-h-[26rem] overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <aside
            className={`w-full shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-800 sm:block sm:w-64 ${
              showList ? "block" : "hidden"
            }`}
          >
            <Section label="Channels" />
            {channels.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
                You&apos;re not in a team yet.
              </p>
            )}
            {channels.map((c) => (
              <Row
                key={c.id}
                conversation={c}
                active={c.id === active}
                onSelect={() => {
                  setActive(c.id);
                  setShowList(false);
                }}
              />
            ))}

            <div className="flex items-center justify-between pr-2">
              <Section label="Direct messages" />
              <button
                onClick={() => setComposing(true)}
                aria-label="Start a new direct message"
                title="Message someone by email"
                className="mt-2 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <Plus size={14} />
              </button>
            </div>
            {directMessages.map((c) => (
              <Row
                key={c.id}
                conversation={c}
                active={c.id === active}
                person={members.find((m) => m.id === c.withUserId)}
                now={serverNow}
                onSelect={() => {
                  setActive(c.id);
                  setShowList(false);
                }}
              />
            ))}
          </aside>

          <section
            className={`flex min-w-0 flex-1 flex-col ${showList ? "hidden sm:flex" : "flex"}`}
          >
            <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
              <button
                onClick={() => setShowList(true)}
                className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100 sm:hidden dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Back to conversations"
              >
                <ArrowLeft size={16} />
              </button>
              {current?.kind === "dm" && (
                <PresenceDot lastSeenAt={person?.lastSeenAt} now={serverNow} />
              )}
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-200">
                {current?.name || "Chat"}
              </span>

            </header>

            {active ? (
              <>
                <ChatMessages messages={messages} currentUserId={userId} />
                <ChatComposer onSend={handleSend} sending={sending} />
              </>
            ) : (
              <p className="px-4 py-6 text-sm text-slate-400 dark:text-slate-500">
                Pick a conversation to get started.
              </p>
            )}
          </section>
        </div>
      </div>

      {composing && <NewMessageDialog onClose={() => setComposing(false)} onPick={startWith} />}
    </div>
  );
}

function Section({ label }) {
  return (
    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
      {label}
    </p>
  );
}

function Row({ conversation, active, onSelect, person, now }) {
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
        <span className="relative shrink-0">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {initials(conversation.name)}
          </span>
          <span className="absolute -bottom-0.5 -right-0.5">
            <PresenceDot lastSeenAt={person?.lastSeenAt} now={now} />
          </span>
        </span>
      )}
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          conversation.unread > 0
            ? "font-semibold text-slate-900 dark:text-slate-100"
            : "text-slate-700 dark:text-slate-300"
        }`}
      >
        {conversation.name}
      </span>
      {conversation.unread > 0 && (
        <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          {conversation.unread}
        </span>
      )}
    </button>
  );
}

/**
 * Starting a DM with someone outside your teams. Exact email only — see the
 * users route for why there is no browsable directory.
 */
function NewMessageDialog({ onClose, onPick }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function find(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/users?email=${encodeURIComponent(email.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't find them");
      onPick(data);
    } catch (err) {
      setError(err.message || "Couldn't find them");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            New message
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={15} />
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Teammates are already listed. To reach anyone else, enter their exact
          email address.
        </p>
        <form onSubmit={find} className="space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="them@example.com"
            autoFocus
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
          />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy && <Loader2 size={14} className="animate-spin" />} Start conversation
          </button>
        </form>
      </div>
    </div>
  );
}

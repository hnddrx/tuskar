"use client";

import { Minus, X, Hash } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useConversation } from "@/lib/useConversation";
import { useTasks } from "@/context/TaskContext";
import ChatMessages, { initials, PresenceDot } from "@/components/ChatMessages";
import ChatComposer from "@/components/ChatComposer";

/**
 * Odoo-style docked conversations: small windows pinned to the bottom-right,
 * available from any page rather than only the Chat page.
 *
 * Each window owns its own polling, so an open window keeps receiving while
 * you work elsewhere in the app.
 */
export default function ChatDock() {
  const { enabled, docked } = useChat();
  if (!enabled || docked.length === 0) return null;

  return (
    // Hidden on phones: a docked window over a small screen would cover the
    // page it is meant to sit beside. The Chat page is the mobile experience.
    <div className="pointer-events-none fixed bottom-0 right-0 z-40 hidden items-end gap-3 p-3 sm:flex">
      {docked.map((w) => (
        <DockedWindow key={w.id} conversationId={w.id} minimized={w.minimized} />
      ))}
    </div>
  );
}

function DockedWindow({ conversationId, minimized }) {
  const { conversations, userId, members, serverNow, close, toggleMinimize, markRead } =
    useChat();
  const {
    team: { orgName },
  } = useTasks();

  // A minimised window stops polling — it is closed for all practical purposes
  // until reopened.
  const { messages, sending, send } = useConversation(conversationId, {
    active: !minimized,
  });

  const conversation = conversations.find((c) => c.id === conversationId);
  const isRoom = conversation?.kind === "room";
  const title = isRoom ? orgName || "Team" : conversation?.name || "Conversation";
  const person = conversation?.withUserId
    ? members.find((m) => m.id === conversation.withUserId)
    : null;

  async function handleSend(body, attachment) {
    const ok = await send(body, attachment);
    if (ok) markRead(conversationId);
    return ok;
  }

  return (
    <div
      className={`pointer-events-auto flex w-72 flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 ${
        minimized ? "" : "h-96"
      }`}
    >
      <header className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-2.5 py-2 dark:border-slate-800 dark:bg-slate-800/60">
        <button
          onClick={() => toggleMinimize(conversationId)}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          aria-expanded={!minimized}
        >
          {isRoom ? (
            <Hash size={13} className="shrink-0 text-slate-400" />
          ) : (
            <span className="relative shrink-0">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {initials(title)}
              </span>
              <span className="absolute -bottom-0.5 -right-0.5">
                <PresenceDot lastSeenAt={person?.lastSeenAt} now={serverNow} />
              </span>
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
            {title}
          </span>
          {minimized && conversation?.unread > 0 && (
            <span className="shrink-0 rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {conversation.unread}
            </span>
          )}
        </button>
        <button
          onClick={() => toggleMinimize(conversationId)}
          aria-label={minimized ? "Expand conversation" : "Minimise conversation"}
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => close(conversationId)}
          aria-label="Close conversation"
          className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <X size={13} />
        </button>
      </header>

      {!minimized && (
        <>
          <ChatMessages messages={messages} currentUserId={userId} compact />
          <ChatComposer onSend={handleSend} sending={sending} compact />
        </>
      )}
    </div>
  );
}

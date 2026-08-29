"use client";

import { Minus, X, Hash } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useConversation } from "@/lib/useConversation";
import { useTasks } from "@/context/TaskContext";
import ChatMessages, { initials, PresenceDot } from "@/components/ChatMessages";
import ChatComposer from "@/components/ChatComposer";
import MessagingMenu from "@/components/MessagingMenu";

/**
 * Odoo-style docked conversations: small windows pinned to the bottom-right,
 * available from any page rather than only the Chat page.
 *
 * Each window owns its own polling, so an open window keeps receiving while
 * you work elsewhere in the app.
 */
export default function ChatDock() {
  const { enabled, docked } = useChat();
  // The launcher is always present once signed in, with or without open
  // windows — it is how chat is reached from any page.
  if (!enabled) return null;

  // A phone has room for one conversation at a time, so only the most recently
  // expanded one is shown there; the rest stay as collapsed title bars. On a
  // wider screen they all sit side by side.
  const lastExpandedId = [...docked].reverse().find((w) => !w.minimized)?.id ?? null;

  return (
    // Extra bottom space on phones clears the page's own create button, which
    // is fixed to the same corner (bottom-5 right-5, mobile only). Applied to
    // the whole row so an open conversation cannot cover it either.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-end justify-end gap-2 p-2 pb-24 pr-5 sm:inset-x-auto sm:right-0 sm:flex-nowrap sm:gap-3 sm:p-3">
      {docked.map((w) => (
        <DockedWindow
          key={w.id}
          conversationId={w.id}
          minimized={w.minimized}
          // Collapsed bars are small enough to keep on a phone; a second
          // expanded window is not.
          hiddenOnMobile={!w.minimized && w.id !== lastExpandedId}
        />
      ))}
      <MessagingMenu />
    </div>
  );
}

function DockedWindow({ conversationId, minimized, hiddenOnMobile }) {
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
      className={`pointer-events-auto flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900 ${
        hiddenOnMobile ? "hidden sm:flex" : "flex"
      } ${
        minimized
          ? // Collapsed: only as wide as its title, so several fit on a phone.
            "w-auto max-w-[45vw] sm:w-72 sm:max-w-none"
          : // Expanded: nearly the full width on a phone, a fixed panel above it.
            "h-[70vh] w-[calc(100vw-1rem)] max-w-sm sm:h-96 sm:w-72 sm:max-w-none"
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

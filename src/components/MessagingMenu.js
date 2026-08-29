"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Hash, X } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { initials, PresenceDot } from "@/components/ChatMessages";

/**
 * The floating chat launcher: a round button carrying the total unread count,
 * opening the conversation list above it. Picking a conversation opens it as a
 * docked window, so you can reply without leaving the page you are on.
 *
 * Rendered by ChatDock as the last item in its row, so the launcher and any
 * open windows sit side by side and cannot overlap each other.
 */
export default function MessagingMenu() {
  const { enabled, conversations, totalUnread, members, serverNow, open } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e) => {
      // Opening swaps the button's icon, so React replaces the very node that
      // was clicked. By the time this runs, that node is detached and
      // contains() reports it as outside — which closed the menu on the same
      // click that opened it. A target no longer in the document tells us
      // nothing about where the click landed, so ignore it.
      if (!document.contains(e.target)) return;
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);

  if (!enabled) return null;

  // Anything unread first, then most recently active.
  const ordered = [...conversations].sort((a, b) => {
    if ((b.unread || 0) !== (a.unread || 0)) return (b.unread || 0) - (a.unread || 0);
    return String(b.lastAt || "").localeCompare(String(a.lastAt || ""));
  });

  return (
    <div className="pointer-events-auto relative" ref={ref}>
      <button
        onClick={(e) => {
          // Keep the toggle out of the outside-click listener entirely.
          e.stopPropagation();
          setIsOpen((o) => !o);
        }}
        aria-label={totalUnread > 0 ? `Messages (${totalUnread} unread)` : "Messages"}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
        {totalUnread > 0 && !isOpen && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white dark:ring-slate-900">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 max-h-[70vh] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Messages
            </span>
            <Link
              href="/chat"
              onClick={() => setIsOpen(false)}
              className="text-[11px] text-slate-500 transition-colors hover:underline dark:text-slate-400"
            >
              Open Chat →
            </Link>
          </div>

          {ordered.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
              No conversations yet.
            </p>
          )}

          {ordered.map((c) => {
            const isRoom = c.kind === "room";
            const person = c.withUserId ? members.find((m) => m.id === c.withUserId) : null;
            return (
              <button
                key={c.id}
                role="menuitem"
                onClick={() => {
                  open(c.id);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                {isRoom ? (
                  <Hash size={14} className="shrink-0 text-slate-400" />
                ) : (
                  <span className="relative shrink-0">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
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
      )}
    </div>
  );
}

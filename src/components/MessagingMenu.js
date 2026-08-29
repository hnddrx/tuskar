"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Hash } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { useTasks } from "@/context/TaskContext";
import { initials, PresenceDot } from "@/components/ChatMessages";

/**
 * Odoo's messaging menu: an icon carrying the total unread count, opening a
 * list of conversations. Clicking one opens it as a docked window, so you can
 * reply without leaving whatever page you were on.
 */
export default function MessagingMenu() {
  const { enabled, conversations, totalUnread, members, serverNow, open } = useChat();
  const {
    team: { orgName },
  } = useTasks();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setIsOpen(false);
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [isOpen]);

  if (!enabled) return null;

  // Anything with unread first, then most recently active.
  const ordered = [...conversations].sort((a, b) => {
    if ((b.unread || 0) !== (a.unread || 0)) return (b.unread || 0) - (a.unread || 0);
    return String(b.lastAt || "").localeCompare(String(a.lastAt || ""));
  });

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        aria-label={totalUnread > 0 ? `Messages (${totalUnread} unread)` : "Messages"}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="relative rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <MessageCircle size={18} />
        {totalUnread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {totalUnread > 9 ? "9+" : totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 w-72 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900"
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
            const label = isRoom ? orgName || "Team" : c.name;
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
                      {initials(label)}
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
                  {label}
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

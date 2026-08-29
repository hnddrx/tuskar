"use client";

import { useEffect, useMemo, useRef } from "react";
import { Paperclip, MessagesSquare } from "lucide-react";
import { groupMessages, presenceStatus } from "@/lib/chat";
import { formatFileSize } from "@/lib/attachments";

export function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

const DOT = {
  online: "bg-emerald-500",
  away: "bg-amber-400",
  offline: "bg-slate-300 dark:bg-slate-600",
};

/** Online / away / offline, derived from a heartbeat (see lib/chat.js). */
export function PresenceDot({ lastSeenAt, now, className = "" }) {
  const status = presenceStatus(lastSeenAt, now);
  return (
    <span
      title={status}
      aria-label={status}
      className={`h-2 w-2 shrink-0 rounded-full ring-2 ring-white dark:ring-slate-900 ${DOT[status]} ${className}`}
    />
  );
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

function Attachment({ messageId, attachment }) {
  const href = `/api/chat/messages/${messageId}/attachment`;
  if (attachment.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={href}
        alt={attachment.filename}
        className="mt-1 max-h-48 rounded-md border border-slate-200 object-contain dark:border-slate-800"
      />
    );
  }
  return (
    <a
      href={href}
      download={attachment.filename}
      className="mt-1 flex w-fit items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Paperclip size={12} className="shrink-0 text-slate-400" />
      <span className="truncate">{attachment.filename}</span>
      <span className="shrink-0 text-slate-400">{formatFileSize(attachment.size)}</span>
    </a>
  );
}

/** The scrolling message list, shared by the Chat page and docked windows. */
export default function ChatMessages({ messages, currentUserId, compact = false }) {
  const bottomRef = useRef(null);
  const grouped = useMemo(() => groupMessages(messages), [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  if (grouped.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <p className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <MessagesSquare size={14} /> No messages yet — say something.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
      {grouped.map((m) => (
        <div key={m.id}>
          {m.startsDay && (
            <div className="my-2 flex items-center gap-2">
              <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {formatDay(m.createdAt)}
              </span>
              <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
            </div>
          )}
          <div className={`flex gap-2 ${m.showHeader ? "mt-2" : ""}`}>
            <div className={compact ? "w-5 shrink-0" : "w-7 shrink-0"}>
              {m.showHeader && (
                <span
                  className={`flex items-center justify-center rounded-full bg-slate-200 font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300 ${
                    compact ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[10px]"
                  }`}
                >
                  {initials(m.author)}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {m.showHeader && (
                <div className="flex items-baseline gap-2">
                  <span
                    className={`font-medium text-slate-800 dark:text-slate-200 ${
                      compact ? "text-xs" : "text-sm"
                    }`}
                  >
                    {m.authorUserId === currentUserId ? "You" : m.author}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {formatTime(m.createdAt)}
                  </span>
                </div>
              )}
              {m.body && (
                <p
                  className={`whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300 ${
                    compact ? "text-xs" : "text-sm"
                  }`}
                >
                  {m.body}
                </p>
              )}
              {m.attachment && <Attachment messageId={m.id} attachment={m.attachment} />}
            </div>
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

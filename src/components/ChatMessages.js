"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Paperclip,
  MessagesSquare,
  MoreHorizontal,
  Reply,
  Pencil,
  Forward,
  Trash2,
  CornerUpLeft,
} from "lucide-react";
import { groupMessages, presenceStatus, canModifyMessage, messageSnippet } from "@/lib/chat";
import { formatFileSize } from "@/lib/attachments";
import ImagePreviewModal from "@/components/ImagePreviewModal";

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
  const [preview, setPreview] = useState(false);
  const href = `/api/chat/messages/${messageId}/attachment`;
  if (attachment.kind === "image") {
    return (
      <>
        <button
          type="button"
          onClick={() => setPreview(true)}
          title="Preview"
          className="mt-1 block transition-opacity hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={attachment.filename}
            className="max-h-48 rounded-md border border-slate-200 object-contain dark:border-slate-800"
          />
        </button>
        <ImagePreviewModal
          src={preview ? href : null}
          attachment={attachment}
          onClose={() => setPreview(false)}
        />
      </>
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

/**
 * The message being replied to, shown above the reply itself.
 *
 * The quote travels with the reply rather than being looked up on screen,
 * because the original can be older than the messages currently loaded.
 * Selecting it jumps to the original when it does happen to be on screen.
 */
function QuotedMessage({ quoted, currentUserId, compact }) {
  const gone = Boolean(quoted.deletedAt);
  return (
    <button
      type="button"
      onClick={() => {
        document
          .getElementById(`chat-message-${quoted.id}`)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }}
      className="mb-0.5 flex w-full items-center gap-1.5 rounded border-l-2 border-slate-300 bg-slate-50 px-1.5 py-1 text-left transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:bg-slate-800"
    >
      <CornerUpLeft size={11} className="shrink-0 text-slate-400" />
      <span
        className={`shrink-0 font-medium text-slate-500 dark:text-slate-400 ${
          compact ? "text-[10px]" : "text-[11px]"
        }`}
      >
        {quoted.authorUserId === currentUserId ? "You" : quoted.author}
      </span>
      <span
        className={`min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400 ${
          compact ? "text-[10px]" : "text-[11px]"
        } ${gone ? "italic" : ""}`}
      >
        {messageSnippet(quoted)}
      </span>
    </button>
  );
}

/** Reply / edit / forward / delete for one message. */
function MessageActions({ mine, onReply, onEdit, onForward, onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function run(action) {
    setOpen(false);
    action?.();
  }

  const items = [
    { key: "reply", label: "Reply", icon: Reply, action: onReply, show: true },
    { key: "forward", label: "Forward", icon: Forward, action: onForward, show: true },
    { key: "edit", label: "Edit", icon: Pencil, action: onEdit, show: mine },
    { key: "delete", label: "Delete", icon: Trash2, action: onDelete, show: mine, danger: true },
  ].filter((i) => i.show && i.action);

  if (items.length === 0) return null;

  // The trigger is always rendered rather than revealed on hover: there is no
  // hover on a phone, and this is the only way to reach these actions there.
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Message actions"
        aria-expanded={open}
        className="rounded p-1 text-slate-300 opacity-70 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-0.5 w-32 overflow-hidden rounded-md border border-slate-200 bg-white py-0.5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          {items.map(({ key, label, icon: Icon, action, danger }) => (
            <button
              key={key}
              type="button"
              onClick={() => run(action)}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                danger
                  ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <Icon size={13} className="shrink-0" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Editing a message in place, rather than in the composer below. */
function EditBox({ message, compact, onSave, onCancel }) {
  const [draft, setDraft] = useState(message.body || "");

  async function save() {
    const text = draft.trim();
    if (!text || text === message.body) return onCancel();
    const ok = await onSave(message.id, text);
    if (ok) onCancel();
  }

  return (
    <div className="mt-0.5">
      <textarea
        value={draft}
        autoFocus
        rows={2}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") onCancel();
        }}
        className={`w-full resize-none rounded-md border border-slate-300 px-2 py-1.5 transition-colors focus:border-slate-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:focus:border-slate-500 ${
          compact ? "text-xs" : "text-sm"
        }`}
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-slate-500 transition-colors hover:underline dark:text-slate-400"
        >
          Cancel
        </button>
        <span className="text-[10px] text-slate-400 dark:text-slate-500">
          Enter saves · Esc cancels
        </span>
      </div>
    </div>
  );
}

/**
 * The scrolling message list, shared by the Chat page and the docked panel.
 *
 * The per-message actions are optional: pass the handlers you want and only
 * those appear.
 */
export default function ChatMessages({
  messages,
  currentUserId,
  compact = false,
  onReply,
  onEdit,
  onForward,
  onDelete,
}) {
  const bottomRef = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const grouped = useMemo(() => groupMessages(messages), [messages]);

  // Follow the conversation down, but not while a message is being edited — a
  // poll landing mid-edit would otherwise yank the box out of view.
  useEffect(() => {
    if (editingId) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, editingId]);

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
      {grouped.map((m) => {
        const deleted = Boolean(m.deletedAt);
        const mine = canModifyMessage(m, currentUserId);
        const editing = editingId === m.id;

        return (
          <div key={m.id} id={`chat-message-${m.id}`}>
            {m.startsDay && (
              <div className="my-2 flex items-center gap-2">
                <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  {formatDay(m.createdAt)}
                </span>
                <span className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
              </div>
            )}
            <div className={`group flex gap-2 ${m.showHeader ? "mt-2" : ""}`}>
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

                {m.replyTo && !deleted && (
                  <QuotedMessage
                    quoted={m.replyTo}
                    currentUserId={currentUserId}
                    compact={compact}
                  />
                )}

                {m.forwarded && !deleted && (
                  <p className="flex items-center gap-1 text-[10px] italic text-slate-400 dark:text-slate-500">
                    <Forward size={10} /> Forwarded
                  </p>
                )}

                {deleted ? (
                  <p
                    className={`italic text-slate-400 dark:text-slate-500 ${
                      compact ? "text-xs" : "text-sm"
                    }`}
                  >
                    This message was deleted
                  </p>
                ) : editing ? (
                  <EditBox
                    message={m}
                    compact={compact}
                    onSave={onEdit}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    {m.body && (
                      <p
                        className={`whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300 ${
                          compact ? "text-xs" : "text-sm"
                        }`}
                      >
                        {m.body}
                        {m.editedAt && (
                          <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500">
                            (edited)
                          </span>
                        )}
                      </p>
                    )}
                    {m.attachment && <Attachment messageId={m.id} attachment={m.attachment} />}
                  </>
                )}
              </div>

              {!deleted && !editing && (
                <MessageActions
                  mine={mine}
                  onReply={onReply ? () => onReply(m) : null}
                  onForward={onForward ? () => onForward(m) : null}
                  onEdit={onEdit ? () => setEditingId(m.id) : null}
                  onDelete={onDelete ? () => onDelete(m) : null}
                />
              )}
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

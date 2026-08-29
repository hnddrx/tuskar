"use client";

import { useState } from "react";
import { Hash, X, Loader2, Check } from "lucide-react";
import { useChat } from "@/context/ChatContext";
import { messageSnippet } from "@/lib/chat";
import { initials } from "@/components/ChatMessages";

/**
 * Picking where to send a copy of a message.
 *
 * Only conversations you are already in are offered, and the server checks
 * that again — this list is a convenience, not the permission.
 */
export default function ForwardMessageDialog({ message, onClose, onForward }) {
  const { conversations, activeId } = useChat();
  const [busyId, setBusyId] = useState(null);
  const [sentTo, setSentTo] = useState([]);
  const [error, setError] = useState(null);

  async function send(conversation) {
    setBusyId(conversation.id);
    setError(null);
    const ok = await onForward(message.id, conversation.id);
    setBusyId(null);
    if (ok) {
      // Left open on purpose: forwarding one message to several places is the
      // common case, and each one shows as done.
      setSentTo((prev) => [...prev, conversation.id]);
    } else {
      setError("Couldn't forward that message.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Forward message
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={15} />
          </button>
        </div>

        <div className="border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {message.author}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
            {messageSnippet(message)}
          </p>
        </div>

        {error && (
          <p className="px-4 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {conversations.length === 0 && (
            <p className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500">
              Nowhere to forward this yet.
            </p>
          )}
          {conversations.map((c) => {
            const done = sentTo.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => send(c)}
                disabled={busyId === c.id || done}
                className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-50 disabled:cursor-default dark:hover:bg-slate-800/60"
              >
                {c.kind === "room" ? (
                  <Hash size={15} className="shrink-0 text-slate-400" />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    {initials(c.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
                  {c.name}
                  {c.id === activeId && (
                    <span className="ml-1 text-[10px] text-slate-400">(this one)</span>
                  )}
                </span>
                {busyId === c.id && <Loader2 size={14} className="animate-spin text-slate-400" />}
                {done && (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <Check size={13} /> Sent
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

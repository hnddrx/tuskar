"use client";

import { useState } from "react";
import { Trash2, Send } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { SyncBadge } from "@/components/Badge";

function formatTs(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CommentThread({ taskId }) {
  const { comments, addComment, deleteComment, orgId } = useTasks();
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("Wren");

  const thread = comments
    .filter((c) => c.ticketId === taskId)
    .sort((a, b) => (a.created < b.created ? 1 : -1));

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    addComment(taskId, { author, text: text.trim() });
    setText("");
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mb-4 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Log an update or comment…"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
        />
        <div className="flex items-center justify-between">
          {!orgId && (
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-32 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:text-slate-400 dark:focus:border-slate-500 transition-colors"
            />
          )}
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 transition-colors"
          >
            <Send size={13} /> Add update
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {thread.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            No comments or updates logged yet.
          </p>
        )}
        {thread.map((c) => (
          <div
            key={c.id}
            className="group flex gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/60"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 dark:text-slate-400">
              {c.author?.[0]?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {c.author}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {formatTs(c.created)}
                </span>
                <SyncBadge source={c.syncSource} />
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-400">
                {c.text}
              </p>
            </div>
            <button
              onClick={() => deleteComment(c.id, taskId)}
              className="h-fit rounded p-1 text-slate-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:text-slate-600 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

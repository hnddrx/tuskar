"use client";

import { useEffect, useState } from "react";

// Maps each configured status to a completion percentage, which is what
// drives automatic progress for tasks with no subtasks (see lib/progress.js).
// A status left blank isn't guessed at — those tasks keep whatever progress
// was set on them by hand.
export default function StatusProgressEditor({ statuses, statusProgress, onChange }) {
  const [draft, setDraft] = useState(statusProgress || {});

  // Re-sync when the saved map changes underneath (another tab, a reset, or
  // the initial load landing after first render).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(statusProgress || {});
  }, [statusProgress]);

  function setLocal(status, raw) {
    setDraft((d) => ({ ...d, [status]: raw }));
  }

  // Committed on blur rather than on every keystroke — each commit is a
  // round trip to the server.
  function commit(status) {
    const raw = draft[status];
    const next = { ...(statusProgress || {}) };
    if (raw === "" || raw === null || raw === undefined) {
      delete next[status];
    } else {
      next[status] = Math.min(100, Math.max(0, Math.round(Number(raw) || 0)));
    }
    onChange(next);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
        Progress by status
      </h2>
      <p className="mb-3 mt-0.5 text-xs text-slate-400 dark:text-slate-500">
        Sets the percentage a task shows for each status. Tasks with subtasks
        average their subtasks instead. Leave a status blank to keep typing its
        progress by hand.
      </p>
      <div className="space-y-1.5">
        {statuses.map((status) => (
          <div
            key={status}
            className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5 dark:border-slate-800 dark:bg-slate-800/60"
          >
            <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-300">
              {status}
            </span>
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              value={draft[status] ?? ""}
              placeholder="—"
              aria-label={`Progress for ${status}`}
              onChange={(e) => setLocal(status, e.target.value)}
              onBlur={() => commit(status)}
              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-500"
            />
            <span className="text-xs text-slate-400 dark:text-slate-500">%</span>
          </div>
        ))}
        {statuses.length === 0 && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Add a status first.
          </p>
        )}
      </div>
    </div>
  );
}

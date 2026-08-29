"use client";

import { useMemo, useState } from "react";
import { Play, Square, Trash2 } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { useNow } from "@/lib/useNow";
import { formatDuration, entrySeconds, totalForTask } from "@/lib/time";
import { formatCountdown } from "@/lib/pomodoro";

/**
 * Time tracked against one task, with a start/stop control.
 *
 * Starting here stops whatever else was running (the API guarantees a single
 * open entry per person), so switching tasks mid-flow cannot double-count.
 */
export default function TaskTimePanel({ taskId, scope = "personal" }) {
  const {
    team: { orgId },
    time: { entries, running, start, stop, remove },
  } = useTasks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isRunningHere = running?.taskId === taskId;
  // Only tick while this task's own timer is live.
  const now = useNow(1000, isRunningHere);

  const taskEntries = useMemo(
    () => entries.filter((e) => e.taskId === taskId),
    [entries, taskId]
  );
  const total = totalForTask(entries, taskId, now);

  async function guard(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Time tracked
        </h2>
        <span className="font-mono text-sm tabular-nums text-slate-600 dark:text-slate-300">
          {formatDuration(total)}
        </span>
      </div>

      {isRunningHere ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/60">
          <span className="font-mono text-lg font-semibold tabular-nums text-red-700 dark:text-red-300">
            {formatCountdown(entrySeconds(running, now))}
          </span>
          <button
            onClick={() => guard(() => stop(running.id))}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <Square size={13} /> Stop
          </button>
        </div>
      ) : (
        <button
          onClick={() =>
            guard(() =>
              start({ taskId, scope, orgId: scope === "team" ? orgId : null })
            )
          }
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Play size={14} /> Start timer
          {running && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              (stops the running one)
            </span>
          )}
        </button>
      )}

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      {taskEntries.length > 0 && (
        <div className="mt-3 space-y-1">
          {taskEntries.slice(0, 8).map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span className="text-slate-400 dark:text-slate-500">
                {entry.startedAt.slice(0, 10)}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-slate-400">
                {entry.description || (entry.source === "pomodoro" ? "Pomodoro" : "")}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-slate-600 dark:text-slate-300">
                {formatDuration(entrySeconds(entry, now))}
              </span>
              <button
                onClick={() => guard(() => remove(entry.id))}
                aria-label="Delete time entry"
                className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {taskEntries.length > 8 && (
            <p className="px-1.5 pt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Showing the 8 most recent of {taskEntries.length} entries — the rest are
              on the Time page.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

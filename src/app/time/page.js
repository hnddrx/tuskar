"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Play, Square, Pause, RotateCcw, Trash2, Plus, Timer } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { useConfirm } from "@/components/ConfirmProvider";
import PageHeader from "@/components/PageHeader";
import ArchivedToggle from "@/components/ArchivedToggle";
import { useNow } from "@/lib/useNow";
import { formatDuration, entrySeconds, totalSeconds, groupByDay } from "@/lib/time";
import {
  DEFAULT_POMODORO,
  phaseAfter,
  phaseSeconds,
  phaseLabel,
  remainingSeconds,
  formatCountdown,
  resumeStartedAt,
} from "@/lib/pomodoro";

const POMODORO_KEY = "taskar:pomodoro:v1";

// `remaining` is only set while paused: it holds the seconds left so that
// resuming can pick up where it stopped. Null means the phase is either
// running (measured from startedAt) or untouched (its full length).
const IDLE_POMODORO = {
  phase: "work",
  startedAt: null,
  remaining: null,
  completedWork: 0,
  taskId: "",
};

export default function TimePage() {
  const {
    personal: { tasks },
    team: { tasks: teamTasks, orgId },
    time: { entries: liveEntries, allEntries, running, start, stop, log, remove },
  } = useTasks();
  const confirm = useConfirm();
  const now = useNow(1000);

  // Every task the timer can be pointed at, tagged with which board it came
  // from so the entry records the right scope.
  const trackable = useMemo(
    () => [
      ...tasks.map((t) => ({ ...t, scope: "personal" })),
      ...teamTasks.map((t) => ({ ...t, scope: "team" })),
    ],
    [tasks, teamTasks]
  );

  const taskById = useMemo(
    () => new Map(trackable.map((t) => [t.id, t])),
    [trackable]
  );

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Local state, unlike the task and note lists: nothing pages through the
  // day log, so there is no second reader to keep in step via the URL.
  const [showArchived, setShowArchived] = useState(false);

  const entries = showArchived ? allEntries : liveEntries;
  const archivedCount = allEntries.length - liveEntries.length;

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

  function startFor(taskId, note) {
    const task = taskById.get(taskId);
    return start({
      taskId: taskId || null,
      scope: task?.scope || "personal",
      orgId: task?.scope === "team" ? orgId : null,
      description: note || "",
    });
  }

  const days = useMemo(() => groupByDay(entries, now), [entries, now]);
  const todayKey = (now || "").slice(0, 10);
  const todaySeconds = useMemo(
    () => totalSeconds(entries.filter((e) => e.startedAt.slice(0, 10) === todayKey), now),
    [entries, todayKey, now]
  );

  return (
    <div className="flex-1">
      <PageHeader
        title="Time"
        subtitle="Track time against any task, run a Pomodoro, and review where the day went."
        actions={
          <ArchivedToggle
            count={archivedCount}
            active={showArchived}
            onChange={setShowArchived}
          />
        }
      />

      <div className="px-4 py-6 sm:px-8">
        {error && (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <StopwatchCard
              running={running}
              now={now}
              busy={busy}
              tasks={trackable}
              taskById={taskById}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              description={description}
              onDescription={setDescription}
              onStart={() =>
                guard(async () => {
                  await startFor(selectedTaskId, description);
                  setDescription("");
                })
              }
              onStop={() => guard(() => stop(running.id))}
              todaySeconds={todaySeconds}
            />

            <TimeLog
              days={days}
              now={now}
              taskById={taskById}
              onDelete={async (entry) => {
                const ok = await confirm({
                  title: "Archive this time entry?",
                  message: "It moves to the Archive, where you can restore it or delete it for good.",
                  confirmLabel: "Archive",
                });
                if (ok) guard(() => remove(entry.id));
              }}
            />
          </div>

          <div className="space-y-5">
            <PomodoroCard
              now={now}
              tasks={trackable}
              taskById={taskById}
              onLogInterval={(taskId, seconds, startedAt, endedAt) => {
                const task = taskById.get(taskId);
                return log({
                  taskId: taskId || null,
                  scope: task?.scope || "personal",
                  orgId: task?.scope === "team" ? orgId : null,
                  description: "Pomodoro",
                  startedAt,
                  endedAt,
                  durationSeconds: seconds,
                  source: "pomodoro",
                });
              }}
            />

            <ManualEntryCard
              tasks={trackable}
              busy={busy}
              onSubmit={(entry) => {
                const task = taskById.get(entry.taskId);
                return guard(() =>
                  log({
                    ...entry,
                    taskId: entry.taskId || null,
                    scope: task?.scope || "personal",
                    orgId: task?.scope === "team" ? orgId : null,
                    source: "manual",
                  })
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskSelect({ tasks, value, onChange, allowNone = true, label }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className="w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:bg-slate-800/60 dark:focus:border-slate-500"
    >
      {allowNone && <option value="">No task — general time</option>}
      {tasks.map((t) => (
        <option key={`${t.scope}-${t.id}`} value={t.id}>
          {t.scope === "team" ? "Team · " : ""}
          {t.ticketId} — {t.name}
        </option>
      ))}
    </select>
  );
}

function Card({ title, children, action }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function StopwatchCard({
  running,
  now,
  busy,
  tasks,
  taskById,
  selectedTaskId,
  onSelectTask,
  description,
  onDescription,
  onStart,
  onStop,
  todaySeconds,
}) {
  const runningTask = running?.taskId ? taskById.get(running.taskId) : null;

  return (
    <Card
      title="Timer"
      action={
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Today: {formatDuration(todaySeconds)}
        </span>
      }
    >
      {running ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {formatCountdown(entrySeconds(running, now))}
            </div>
            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
              {runningTask ? (
                <>
                  <span className="font-mono text-xs">{runningTask.ticketId}</span>{" "}
                  {runningTask.name}
                </>
              ) : (
                running.description || "General time"
              )}
            </p>
          </div>
          <button
            onClick={onStop}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <Square size={14} /> Stop
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          <TaskSelect
            tasks={tasks}
            value={selectedTaskId}
            onChange={onSelectTask}
            label="Task to track"
          />
          <div className="flex gap-2">
            <input
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              placeholder="What are you working on? (optional)"
              className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
            />
            <button
              onClick={onStart}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              <Play size={14} /> Start
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function PomodoroCard({ now, tasks, taskById, onLogInterval }) {
  const [state, setState] = useState(IDLE_POMODORO);
  const [hydrated, setHydrated] = useState(false);

  // Restored from localStorage rather than kept in the database: the cycle is
  // a per-device focus aid, and only its finished intervals are real data.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POMODORO_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setState({ ...IDLE_POMODORO, ...JSON.parse(raw) });
    } catch {
      /* a corrupt value just means starting fresh */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(POMODORO_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const isRunning = Boolean(state.startedAt);
  const left = isRunning
    ? remainingSeconds(state.phase, state.startedAt, now, DEFAULT_POMODORO)
    : (state.remaining ?? phaseSeconds(state.phase, DEFAULT_POMODORO));

  const advance = useCallback(() => {
    setState((s) => {
      const completedWork = s.phase === "work" ? s.completedWork + 1 : s.completedWork;
      return {
        ...s,
        phase: phaseAfter(s.phase, completedWork, DEFAULT_POMODORO),
        completedWork,
        // The next phase waits for a deliberate start rather than running on
        // its own — a break you didn't notice starting is a break you don't take.
        startedAt: null,
        remaining: null,
      };
    });
  }, []);

  // A finished focus interval becomes a real time entry.
  useEffect(() => {
    if (!isRunning || !now || left > 0) return;
    const endedAt = now;
    const startedAt = state.startedAt;
    if (state.phase === "work") {
      onLogInterval(
        state.taskId,
        phaseSeconds("work", DEFAULT_POMODORO),
        startedAt,
        endedAt
      )?.catch?.(() => {});
    }
    // Advancing the phase is the whole point of this effect: the countdown
    // reaching zero is a real state transition, and it fires once per phase
    // (the guard above returns while time remains), so it cannot cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    advance();
  }, [left, isRunning, now, state.phase, state.startedAt, state.taskId, onLogInterval, advance]);

  const selectedTask = state.taskId ? taskById.get(state.taskId) : null;

  return (
    <Card
      title="Pomodoro"
      action={
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {state.completedWork} done
        </span>
      }
    >
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {phaseLabel(state.phase)}
        </p>
        <div
          className={`my-2 font-mono text-4xl font-semibold tabular-nums ${
            state.phase === "work"
              ? "text-slate-900 dark:text-slate-100"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {formatCountdown(left)}
        </div>
      </div>

      <div className="mt-3 flex justify-center gap-2">
        {isRunning ? (
          <button
            onClick={() => setState((s) => ({ ...s, startedAt: null, remaining: left }))}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Pause size={13} /> Pause
          </button>
        ) : (
          <button
            onClick={() =>
              setState((s) => ({
                ...s,
                startedAt: resumeStartedAt(
                  s.phase,
                  s.remaining ?? phaseSeconds(s.phase, DEFAULT_POMODORO),
                  new Date().toISOString(),
                  DEFAULT_POMODORO
                ),
                remaining: null,
              }))
            }
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            <Play size={13} />{" "}
            {state.remaining === null
              ? `Start ${phaseLabel(state.phase).toLowerCase()}`
              : "Resume"}
          </button>
        )}
        <button
          onClick={() => setState(IDLE_POMODORO)}
          title="Reset the cycle"
          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Log focus time to
        </label>
        <TaskSelect
          tasks={tasks}
          value={state.taskId}
          onChange={(taskId) => setState((s) => ({ ...s, taskId }))}
          label="Task for Pomodoro time"
        />
        <p className="mt-1.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
          {selectedTask
            ? `Each finished ${DEFAULT_POMODORO.workMinutes}-minute focus block is logged to ${selectedTask.ticketId}.`
            : "Pick a task and each finished focus block is logged against it."}
        </p>
      </div>
    </Card>
  );
}

function ManualEntryCard({ tasks, busy, onSubmit }) {
  const [taskId, setTaskId] = useState("");
  const [minutes, setMinutes] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  // Defaulted on mount rather than in the initial state: today's date read
  // during render differs between the server (UTC) and the client (local).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDate(new Date().toISOString().slice(0, 10));
  }, []);

  function submit(e) {
    e.preventDefault();
    const mins = Math.max(0, Math.round(Number(minutes) || 0));
    if (!mins || !date) return;
    // Anchored at 09:00 local so a back-dated entry lands on the day the user
    // picked rather than sliding into the previous one across a timezone.
    const startedAt = new Date(`${date}T09:00:00`).toISOString();
    const endedAt = new Date(Date.parse(startedAt) + mins * 60000).toISOString();
    onSubmit({ taskId, startedAt, endedAt, durationSeconds: mins * 60, description: note });
    setMinutes("");
    setNote("");
  }

  return (
    <Card title="Log time manually">
      <form onSubmit={submit} className="space-y-2.5">
        <TaskSelect tasks={tasks} value={taskId} onChange={setTaskId} label="Task" />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Date"
            className="flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
          />
          <input
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="Minutes"
            aria-label="Minutes"
            className="w-24 rounded-md border border-slate-200 px-2.5 py-1.5 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
          />
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm transition-colors focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          <Plus size={14} /> Add entry
        </button>
      </form>
    </Card>
  );
}

function TimeLog({ days, now, taskById, onDelete }) {
  if (days.length === 0) {
    return (
      <Card title="Time log">
        <p className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <Timer size={14} /> Nothing tracked yet. Start the timer above, or log time manually.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Time log">
      <div className="space-y-5">
        {days.map((day) => (
          <div key={day.date}>
            <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {day.date}
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {formatDuration(day.seconds)}
              </span>
            </div>
            <div className="space-y-1">
              {day.entries.map((entry) => {
                const task = entry.taskId ? taskById.get(entry.taskId) : null;
                const href =
                  task && task.scope === "team"
                    ? `/team/tasks/${task.id}`
                    : task
                      ? `/tasks/${task.id}`
                      : null;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      {href ? (
                        <Link
                          href={href}
                          className="truncate text-sm text-slate-700 transition-colors hover:underline dark:text-slate-300"
                        >
                          <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                            {task.ticketId}
                          </span>{" "}
                          {task.name}
                        </Link>
                      ) : (
                        <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                          {entry.description || "General time"}
                        </span>
                      )}
                      {task && entry.description && (
                        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                          {entry.description}
                        </p>
                      )}
                    </div>
                    {!entry.endedAt && (
                      <span className="shrink-0 animate-pulse rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-red-600 dark:bg-red-950 dark:text-red-400">
                        Running
                      </span>
                    )}
                    <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {formatDuration(entrySeconds(entry, now))}
                    </span>
                    <button
                      onClick={() => onDelete(entry)}
                      aria-label="Delete entry"
                      className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-950"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

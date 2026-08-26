"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { ChevronLeft, ChevronRight, CalendarPlus, Mail, Users } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { StatusBadge, PriorityBadge } from "@/components/Badge";
import PageHeader from "@/components/PageHeader";
import { buildTaskInvite, downloadIcs, buildInviteMailto } from "@/lib/ics";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SCOPES = [
  { key: "all", label: "All" },
  { key: "personal", label: "Personal" },
  { key: "team", label: "Team" },
];

// Local-date key. Deliberately built from the calendar's own y/m/d rather
// than Date.toISOString(), which converts to UTC and can land on the wrong
// day for anyone east or west of it.
function ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayKey() {
  const now = new Date();
  return ymd(now.getFullYear(), now.getMonth(), now.getDate());
}

// The 42 cells (6 weeks) of a month view, including the leading/trailing days
// from the adjacent months that fill out the first and last rows.
function buildGrid(year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysThisMonth = new Date(year, month + 1, 0).getDate();
  const daysPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = daysPrevMonth - i;
    const date = new Date(year, month - 1, d);
    cells.push({ key: ymd(date.getFullYear(), date.getMonth(), d), day: d, outside: true });
  }
  for (let d = 1; d <= daysThisMonth; d++) {
    cells.push({ key: ymd(year, month, d), day: d, outside: false });
  }
  let d = 1;
  while (cells.length < 42) {
    const date = new Date(year, month + 1, d);
    cells.push({ key: ymd(date.getFullYear(), date.getMonth(), d), day: d, outside: true });
    d++;
  }
  return cells;
}

export default function CalendarPage() {
  const { personal, team } = useTasks();
  const { user } = useUser();

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [scope, setScope] = useState("all");
  const [selected, setSelected] = useState(todayKey());

  const organizer = useMemo(
    () => ({
      name: user?.fullName || null,
      email: user?.primaryEmailAddress?.emailAddress || null,
    }),
    [user]
  );

  // One flat list of both scopes, tagged so each entry knows where it came
  // from — that drives its colour, its detail-page link, and whether an
  // invite gets real attendees.
  const events = useMemo(() => {
    const out = [];
    if (scope !== "team") {
      for (const t of personal.tasks) {
        const date = t.targetDate || t.startDate;
        if (date) out.push({ task: t, date, scope: "personal" });
      }
    }
    if (scope !== "personal") {
      for (const t of team.tasks) {
        const date = t.targetDate || t.startDate;
        if (date) out.push({ task: t, date, scope: "team" });
      }
    }
    return out;
  }, [personal.tasks, team.tasks, scope]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor]);
  const selectedEvents = byDate.get(selected) || [];
  const today = todayKey();

  function shiftMonth(delta) {
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function goToday() {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(todayKey());
  }

  // A team task's attendees are the members it's assigned to; a personal task
  // has none, so its .ics is a plain event for your own calendar rather than
  // an invite.
  function attendeesFor(event) {
    if (event.scope !== "team") return [];
    const ids = event.task.assigneeIds || [];
    return team.members.filter((m) => ids.includes(m.id));
  }

  function taskHref(event) {
    const base = event.scope === "team" ? "/team/tasks" : "/tasks";
    const params = new URLSearchParams({ from: "/calendar", fromLabel: "Calendar" });
    return `${base}/${event.task.id}?${params.toString()}`;
  }

  function downloadInvite(event) {
    const ics = buildTaskInvite({
      task: event.task,
      attendees: attendeesFor(event),
      organizer,
      url: typeof window !== "undefined" ? `${window.location.origin}${taskHref(event)}` : null,
    });
    if (!ics) return;
    const safe = (event.task.ticketId !== "N/A" ? event.task.ticketId : event.task.name)
      .replace(/[^a-z0-9-]/gi, "_")
      .slice(0, 60);
    downloadIcs(`${safe}.ics`, ics);
  }

  // Downloads the .ics *and* opens the mail client — mailto: can't carry an
  // attachment, so the user attaches the file the browser just saved.
  function emailInvite(event) {
    downloadInvite(event);
    window.location.href = buildInviteMailto({
      task: event.task,
      attendees: attendeesFor(event),
      url: typeof window !== "undefined" ? `${window.location.origin}${taskHref(event)}` : null,
    });
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Calendar"
        subtitle="Tasks by due date. Add any of them to your calendar, or invite the people assigned."
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={goToday}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Today
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="rounded-md border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        }
      >
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {MONTHS[cursor.month]} {cursor.year}
          </h2>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
            {SCOPES.map((s) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  scope === s.key
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="px-4 py-6 sm:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Month grid */}
          <div className="lg:col-span-2">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500"
                  >
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((cell) => {
                  const dayEvents = byDate.get(cell.key) || [];
                  const isSelected = cell.key === selected;
                  const isToday = cell.key === today;
                  return (
                    <button
                      key={cell.key}
                      onClick={() => setSelected(cell.key)}
                      className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 text-left align-top transition-colors last:border-r-0 dark:border-slate-800 ${
                        isSelected
                          ? "bg-slate-100 dark:bg-slate-800"
                          : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      } ${cell.outside ? "opacity-40" : ""}`}
                    >
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                          isToday
                            ? "bg-slate-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                            : "text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {cell.day}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 2).map((e) => (
                          <div
                            key={`${e.scope}-${e.task.id}`}
                            title={e.task.name}
                            className={`truncate rounded px-1 py-0.5 text-[11px] leading-tight ${
                              e.scope === "team"
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {e.task.name}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <div className="px-1 text-[10px] text-slate-400 dark:text-slate-500">
                            +{dayEvents.length - 2} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />
                Personal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400 dark:bg-indigo-500" />
                Team
              </span>
            </div>
          </div>

          {/* Selected day */}
          <div>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                {selected}
              </h2>

              {selectedEvents.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Nothing due on this day.
                </p>
              )}

              <div className="space-y-3">
                {selectedEvents.map((e) => {
                  const attendees = attendeesFor(e);
                  return (
                    <div
                      key={`${e.scope}-${e.task.id}`}
                      className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                          {e.task.ticketId}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            e.scope === "team"
                              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {e.scope === "team" ? "Team" : "Personal"}
                        </span>
                      </div>

                      <Link
                        href={taskHref(e)}
                        className="block text-sm font-medium text-slate-800 hover:underline dark:text-slate-200"
                      >
                        {e.task.name}
                      </Link>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={e.task.status} />
                        <PriorityBadge priority={e.task.priority} />
                      </div>

                      {attendees.length > 0 && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <Users size={12} className="shrink-0" />
                          <span className="truncate">
                            {attendees.map((a) => a.name).join(", ")}
                          </span>
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => downloadInvite(e)}
                          className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          <CalendarPlus size={13} /> Add to calendar
                        </button>
                        {attendees.length > 0 && (
                          <button
                            onClick={() => emailInvite(e)}
                            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                          >
                            <Mail size={13} /> Send invite
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

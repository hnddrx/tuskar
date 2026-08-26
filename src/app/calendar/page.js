"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  Mail,
  Users,
  Plus,
  Trash2,
  MapPin,
  Clock,
} from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { StatusBadge, PriorityBadge } from "@/components/Badge";
import PageHeader from "@/components/PageHeader";
import ScopeBadge from "@/components/ScopeBadge";
import EventFormModal from "@/components/EventFormModal";
import {
  buildTaskInvite,
  buildEventInvite,
  downloadIcs,
  buildInviteMailto,
  buildEventMailto,
} from "@/lib/ics";

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
  const confirm = useConfirm();

  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [scope, setScope] = useState("all");
  const [selected, setSelected] = useState(todayKey());
  const [composeOpen, setComposeOpen] = useState(false);

  const organizer = useMemo(
    () => ({
      name: user?.fullName || null,
      email: user?.primaryEmailAddress?.emailAddress || null,
    }),
    [user]
  );

  // One flat list of everything dated, tagged with what it is and which space
  // it came from — that drives colour, the detail link, and invite handling.
  const entries = useMemo(() => {
    const out = [];
    const wantPersonal = scope !== "team";
    const wantTeam = scope !== "personal";

    if (wantPersonal) {
      for (const t of personal.tasks) {
        const date = t.targetDate || t.startDate;
        if (date) out.push({ kind: "task", scope: "personal", date, task: t });
      }
      for (const e of personal.events) {
        out.push({ kind: "event", scope: "personal", date: e.eventDate, event: e });
      }
    }
    if (wantTeam) {
      for (const t of team.tasks) {
        const date = t.targetDate || t.startDate;
        if (date) out.push({ kind: "task", scope: "team", date, task: t });
      }
      for (const e of team.events) {
        out.push({ kind: "event", scope: "team", date: e.eventDate, event: e });
      }
    }
    return out;
  }, [personal.tasks, personal.events, team.tasks, team.events, scope]);

  const byDate = useMemo(() => {
    const map = new Map();
    for (const e of entries) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    }
    // Meetings before tasks within a day — a timed commitment is the thing
    // you actually have to show up for.
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
        if (a.kind === "event") {
          return (a.event.startTime || "").localeCompare(b.event.startTime || "");
        }
        return 0;
      });
    }
    return map;
  }, [entries]);

  const cells = useMemo(() => buildGrid(cursor.year, cursor.month), [cursor]);
  const selectedEntries = byDate.get(selected) || [];
  const today = todayKey();

  function entryKey(e) {
    return `${e.kind}-${e.scope}-${e.kind === "task" ? e.task.id : e.event.id}`;
  }

  function entryTitle(e) {
    return e.kind === "task" ? e.task.name : e.event.title;
  }

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
  // an invite. An event carries its own attendee snapshot.
  function attendeesFor(entry) {
    if (entry.kind === "event") return entry.event.attendees || [];
    if (entry.scope !== "team") return [];
    const ids = entry.task.assigneeIds || [];
    return team.members.filter((m) => ids.includes(m.id));
  }

  function taskHref(entry) {
    const base = entry.scope === "team" ? "/team/tasks" : "/tasks";
    const params = new URLSearchParams({ from: "/calendar", fromLabel: "Calendar" });
    return `${base}/${entry.task.id}?${params.toString()}`;
  }

  function absoluteUrl(entry) {
    if (entry.kind !== "task" || typeof window === "undefined") return null;
    return `${window.location.origin}${taskHref(entry)}`;
  }

  function icsFor(entry) {
    return entry.kind === "task"
      ? buildTaskInvite({
          task: entry.task,
          attendees: attendeesFor(entry),
          organizer,
          url: absoluteUrl(entry),
        })
      : buildEventInvite({ event: entry.event, organizer });
  }

  function downloadInvite(entry) {
    const ics = icsFor(entry);
    if (!ics) return;
    const raw =
      entry.kind === "task"
        ? entry.task.ticketId !== "N/A"
          ? entry.task.ticketId
          : entry.task.name
        : entry.event.title;
    downloadIcs(`${raw.replace(/[^a-z0-9-]/gi, "_").slice(0, 60)}.ics`, ics);
  }

  // Downloads the .ics *and* opens the mail client — mailto: can't carry an
  // attachment, so the user attaches the file the browser just saved.
  function emailInvite(entry) {
    downloadInvite(entry);
    window.location.href =
      entry.kind === "task"
        ? buildInviteMailto({
            task: entry.task,
            attendees: attendeesFor(entry),
            url: absoluteUrl(entry),
          })
        : buildEventMailto({ event: entry.event });
  }

  async function removeEvent(entry) {
    const ok = await confirm({
      title: `Delete "${entry.event.title}"?`,
      message: "This removes the invite from your calendar. It cannot be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    if (entry.scope === "team") team.deleteEvent(entry.event.id);
    else personal.deleteEvent(entry.event.id);
  }

  // A freshly created invite: jump the calendar to its date, select it, and
  // hand the user the .ics straight away so "create invite" ends with an
  // invite in hand rather than just a row in a table.
  function handleCreated({ event, scope: createdScope }) {
    const [y, m] = event.eventDate.split("-").map(Number);
    setCursor({ year: y, month: m - 1 });
    setSelected(event.eventDate);
    if (createdScope === "team") setScope((s) => (s === "personal" ? "all" : s));
    else setScope((s) => (s === "team" ? "all" : s));
    downloadInvite({ kind: "event", scope: createdScope, date: event.eventDate, event });
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Calendar"
        subtitle="Tasks by due date, plus meetings you've scheduled. Invite anyone by email."
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
            <button
              onClick={() => setComposeOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              <Plus size={16} /> New invite
            </button>
          </div>
        }
        mobileFab={{ onClick: () => setComposeOpen(true), label: "New invite" }}
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
                  const dayEntries = byDate.get(cell.key) || [];
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
                        {dayEntries.slice(0, 2).map((e) => (
                          <div
                            key={entryKey(e)}
                            title={entryTitle(e)}
                            className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] leading-tight ${
                              e.scope === "team"
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {/* A meeting reads differently from a due date, so
                                events get a filled dot and tasks don't. */}
                            {e.kind === "event" && (
                              <span
                                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                  e.scope === "team"
                                    ? "bg-indigo-500"
                                    : "bg-slate-400 dark:bg-slate-500"
                                }`}
                              />
                            )}
                            <span className="truncate">{entryTitle(e)}</span>
                          </div>
                        ))}
                        {dayEntries.length > 2 && (
                          <div className="px-1 text-[10px] text-slate-400 dark:text-slate-500">
                            +{dayEntries.length - 2} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />
                Personal
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400 dark:bg-indigo-500" />
                Team
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
                Meeting
              </span>
            </div>
          </div>

          {/* Selected day */}
          <div>
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {selected}
                </h2>
                <button
                  onClick={() => setComposeOpen(true)}
                  className="flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  <Plus size={13} /> Invite
                </button>
              </div>

              {selectedEntries.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  Nothing on this day yet.
                </p>
              )}

              <div className="space-y-3">
                {selectedEntries.map((e) => {
                  const attendees = attendeesFor(e);
                  const isEvent = e.kind === "event";
                  return (
                    <div
                      key={entryKey(e)}
                      className="rounded-lg border border-slate-100 p-3 dark:border-slate-800"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                          {isEvent ? "Meeting" : e.task.ticketId}
                        </span>
                        <ScopeBadge
                          scope={e.scope}
                          teamName={e.scope === "team" ? team.orgName : null}
                        />
                      </div>

                      {isEvent ? (
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {e.event.title}
                        </p>
                      ) : (
                        <Link
                          href={taskHref(e)}
                          className="block text-sm font-medium text-slate-800 hover:underline dark:text-slate-200"
                        >
                          {e.task.name}
                        </Link>
                      )}

                      {isEvent ? (
                        <div className="mt-1.5 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                          <p className="flex items-center gap-1.5">
                            <Clock size={12} className="shrink-0" />
                            {e.event.startTime
                              ? `${e.event.startTime}${e.event.endTime ? `–${e.event.endTime}` : ""}`
                              : "All day"}
                          </p>
                          {e.event.location && (
                            <p className="flex items-center gap-1.5">
                              <MapPin size={12} className="shrink-0" />
                              <span className="truncate">{e.event.location}</span>
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={e.task.status} />
                          <PriorityBadge priority={e.task.priority} />
                        </div>
                      )}

                      {attendees.length > 0 && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          <Users size={12} className="shrink-0" />
                          <span className="truncate">
                            {attendees.map((a) => a.name || a.email).join(", ")}
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
                        {isEvent && (
                          <button
                            onClick={() => removeEvent(e)}
                            aria-label="Delete invite"
                            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-slate-500"
                          >
                            <Trash2 size={13} />
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

      <EventFormModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        defaultDate={selected}
        onCreated={handleCreated}
      />
    </div>
  );
}

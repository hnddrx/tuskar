"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useTasks } from "@/context/TaskContext";
import { StatusBadge, PriorityBadge } from "@/components/Badge";
import ScopeBadge from "@/components/ScopeBadge";
import { DONE_STATUSES } from "@/lib/constants";
import PageHeader from "@/components/PageHeader";

// Counts shared by the personal and team summaries, so the two read the same
// way rather than each deriving its own numbers.
function summarise(list, today) {
  const open = list.filter((t) => !DONE_STATUSES.includes(t.status));
  return {
    open,
    done: list.filter((t) => DONE_STATUSES.includes(t.status)),
    highPriority: open.filter((t) =>
      ["Critical", "Highest", "High"].includes(t.priority)
    ),
    overdue: open.filter((t) => t.targetDate && new Date(t.targetDate) < today),
  };
}

export default function OverviewPage() {
  const {
    personal: { tasks, comments },
    team: { tasks: teamTasks, orgId, orgName, members },
  } = useTasks();
  const { userId } = useAuth();

  const open = tasks.filter((t) => !DONE_STATUSES.includes(t.status));
  const done = tasks.filter((t) => DONE_STATUSES.includes(t.status));
  const jiraSynced = tasks.filter((t) => t.syncSource === "Jira");
  const highPriority = open.filter((t) =>
    ["Critical", "Highest", "High"].includes(t.priority)
  );

  const today = new Date();
  const overdue = open.filter(
    (t) => t.targetDate && new Date(t.targetDate) < today
  );

  const recent = [...tasks]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 6);

  // The team summary only appears when a team is actually active — with a
  // personal account selected there is nothing to summarise.
  const teamSummary = summarise(teamTasks || [], today);
  const assignedToMe = (teamTasks || []).filter((t) =>
    (t.assigneeIds || []).includes(userId)
  );
  const teamOpenAssignedToMe = assignedToMe.filter(
    (t) => !DONE_STATUSES.includes(t.status)
  );
  const teamRecent = [...(teamTasks || [])]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 5);

  const teamStats = [
    { label: "Team open", value: teamSummary.open.length },
    { label: "Assigned to me", value: teamOpenAssignedToMe.length },
    { label: "High priority (open)", value: teamSummary.highPriority.length },
    {
      label: "Overdue",
      value: teamSummary.overdue.length,
      warn: teamSummary.overdue.length > 0,
    },
  ];

  const stats = [
    { label: "Open tasks", value: open.length },
    { label: "Completed", value: done.length },
    { label: "High priority (open)", value: highPriority.length },
    { label: "Overdue", value: overdue.length, warn: overdue.length > 0 },
  ];

  return (
    <div className="flex-1">
      <PageHeader
        title="Overview"
        subtitle="Everything you're tracking, at a glance."
      />

      <div className="px-4 py-6 sm:px-8">
        <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-xs text-slate-400 dark:text-slate-500">{s.label}</p>
              <p
                className={`mt-1 text-2xl font-semibold ${
                  s.warn ? "text-red-600" : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {s.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Recently updated
              </h2>
              <Link href="/tasks" className="text-xs text-slate-500 hover:underline transition-colors dark:text-slate-400">
                View all →
              </Link>
            </div>
            <div className="space-y-1">
              {recent.map((t) => (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="hidden shrink-0 font-mono text-xs text-slate-400 sm:inline dark:text-slate-500">
                      {t.ticketId}
                    </span>
                    <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                      {t.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Jira Import
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {jiraSynced.length > 0
                  ? `${jiraSynced.length} task(s) imported from Jira.`
                  : "Nothing imported from Jira yet."}
              </p>
              <Link
                href="/jira"
                className="mt-3 inline-block text-xs font-medium text-slate-900 underline dark:text-slate-100"
              >
                Set up / run import →
              </Link>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Documentation
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {comments.length} update{comments.length === 1 ? "" : "s"}{" "}
                logged across all tasks.
              </p>
              <Link
                href="/docs"
                className="mt-3 inline-block text-xs font-medium text-slate-900 underline dark:text-slate-100"
              >
                Export project docs →
              </Link>
            </div>
          </div>
        </div>

        {orgId && (
          <section className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Team
                </h2>
                <ScopeBadge scope="team" teamName={orgName} />
                {members?.length > 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {members.length} member{members.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <Link
                href="/team/tasks"
                className="text-xs text-slate-500 transition-colors hover:underline dark:text-slate-400"
              >
                View team tasks →
              </Link>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {teamStats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-950 dark:bg-indigo-950/20"
                >
                  <p className="text-xs text-slate-500 dark:text-slate-400">{s.label}</p>
                  <p
                    className={`mt-1 text-2xl font-semibold ${
                      s.warn ? "text-red-600" : "text-slate-900 dark:text-slate-100"
                    }`}
                  >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Recent team activity
              </h3>
              {teamRecent.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  No team tasks yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {teamRecent.map((t) => (
                    <Link
                      key={t.id}
                      href={`/team/tasks/${t.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="hidden shrink-0 font-mono text-xs text-slate-400 sm:inline dark:text-slate-500">
                          {t.ticketId}
                        </span>
                        <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                          {t.name}
                        </span>
                        {(t.assigneeIds || []).includes(userId) && (
                          <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-slate-100 dark:text-slate-900">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <PriorityBadge priority={t.priority} />
                        <StatusBadge status={t.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

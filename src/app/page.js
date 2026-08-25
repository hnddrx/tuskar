"use client";

import Link from "next/link";
import { useTasks } from "@/context/TaskContext";
import { StatusBadge, PriorityBadge } from "@/components/Badge";
import { DONE_STATUSES } from "@/lib/constants";
import PageHeader from "@/components/PageHeader";

export default function OverviewPage() {
  const { tasks, comments } = useTasks();

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
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
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
          <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2 dark:border-slate-800 dark:bg-slate-900">
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
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
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
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
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
      </div>
    </div>
  );
}

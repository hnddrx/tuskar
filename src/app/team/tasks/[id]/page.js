"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FileDown, ExternalLink, GitBranch, Save, Undo2 } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { StatusBadge, PriorityBadge, TypeBadge, SyncBadge } from "@/components/Badge";
import { ProgressBar } from "@/components/ProgressBar";
import InlineField from "@/components/InlineField";
import TeamAssigneePicker from "@/components/TeamAssigneePicker";
import CommentThread from "@/components/CommentThread";
import PageHeader from "@/components/PageHeader";
import Breadcrumbs from "@/components/Breadcrumbs";
import TaskTimePanel from "@/components/TaskTimePanel";
import NoActiveTeam from "@/components/NoActiveTeam";
import { generateTaskDoc, downloadMarkdown } from "@/lib/docGenerator";

export default function TeamTaskDetailPage() {
  return (
    <Suspense fallback={<div className="flex-1 p-8 text-sm text-slate-400 dark:text-slate-500">Loading…</div>}>
      <TeamTaskDetailPageInner />
    </Suspense>
  );
}

function TeamTaskDetailPageInner() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const {
    team: { tasks, comments, config, updateTask, addComment, deleteComment, members, orgId, orgName },
  } = useTasks();

  const [pendingChanges, setPendingChanges] = useState({});

  if (!orgId) return <NoActiveTeam title="Team Task" />;

  const task = tasks.find((t) => t.id === id);

  if (!task) {
    return (
      <div className="flex-1 p-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">Task not found.</p>
        <Link href="/team/tasks" className="text-sm text-slate-900 underline dark:text-slate-100">
          Back to team task table
        </Link>
      </div>
    );
  }

  const subtasks = tasks.filter((t) => t.parentId === task.id);
  const isDirty = Object.keys(pendingChanges).length > 0;

  function effective(field) {
    return field in pendingChanges ? pendingChanges[field] : task[field];
  }

  function patchPending(field, value) {
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (value === task[field]) {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  }

  function saveChanges() {
    updateTask(task.id, pendingChanges);
    setPendingChanges({});
  }

  function discardChanges() {
    setPendingChanges({});
  }

  const from = searchParams.get("from") || "/team/tasks";
  const fromLabel = searchParams.get("fromLabel") || "Team Task Table";

  const ancestors = [];
  let cursor = task.parentId ? tasks.find((t) => t.id === task.parentId) : null;
  while (cursor) {
    ancestors.unshift(cursor);
    cursor = cursor.parentId ? tasks.find((t) => t.id === cursor.parentId) : null;
  }

  function relatedTaskHref(taskId) {
    const params = new URLSearchParams({ from, fromLabel });
    return `/team/tasks/${taskId}?${params.toString()}`;
  }

  const breadcrumbItems = [
    { label: fromLabel, href: from },
    ...ancestors.map((a) => ({ label: a.ticketId, href: relatedTaskHref(a.id) })),
    { label: task.ticketId },
  ];

  function exportDoc() {
    const doc = generateTaskDoc(task, comments, tasks);
    downloadMarkdown(`${task.ticketId.replace(/[^a-z0-9-]/gi, "_")}.md`, doc);
  }

  const pendingAssigneeIds = "assigneeIds" in pendingChanges ? pendingChanges.assigneeIds : task.assigneeIds;

  return (
    <div className="flex-1">
      <PageHeader
        scope="team"
        teamName={orgName}
        title={
          <InlineField
            value={effective("name")}
            onCommit={(v) => patchPending("name", v.trim() || "Untitled task")}
            viewClassName="truncate text-lg font-semibold text-slate-900 dark:text-slate-100"
          />
        }
        actions={
          <>
            {isDirty && (
              <>
                <button
                  onClick={saveChanges}
                  className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors dark:bg-slate-100 dark:text-slate-900"
                >
                  <Save size={14} /> Save
                </button>
                <button
                  onClick={discardChanges}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <Undo2 size={14} /> Discard
                </button>
              </>
            )}
            <button
              onClick={exportDoc}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <FileDown size={14} /> Export doc
            </button>
          </>
        }
      >
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex flex-wrap items-center gap-2">
          <InlineField
            type="select"
            inline
            value={effective("type")}
            options={config.types}
            onCommit={(v) => patchPending("type", v)}
            renderView={(v) => <TypeBadge type={v} />}
          />
          <InlineField
            type="select"
            inline
            value={effective("status")}
            options={config.statuses}
            onCommit={(v) => patchPending("status", v)}
            renderView={(v) => <StatusBadge status={v} />}
          />
          <InlineField
            type="select"
            inline
            value={effective("priority")}
            options={config.priorities}
            onCommit={(v) => patchPending("priority", v)}
            renderView={(v) => <PriorityBadge priority={v} />}
          />
          <SyncBadge source={task.syncSource} />
        </div>
      </PageHeader>

      <div className="px-4 py-6 sm:px-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Description
              </h2>
              <InlineField
                type="textarea"
                value={effective("description") || ""}
                onCommit={(v) => patchPending("description", v)}
                placeholder="No description provided."
                viewClassName="whitespace-pre-wrap text-sm leading-relaxed text-slate-600 dark:text-slate-400"
              />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                Comments &amp; update history
              </h2>
              <CommentThread
                taskId={task.id}
                comments={comments}
                addComment={addComment}
                deleteComment={deleteComment}
                showAuthorField={false}
              />
            </section>

            {subtasks.length > 0 && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Subtasks ({subtasks.length})
                </h2>
                <div className="space-y-2">
                  {subtasks.map((s) => (
                    <Link
                      key={s.id}
                      href={relatedTaskHref(s.id)}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 transition-colors dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 font-mono text-xs text-slate-400 dark:text-slate-500">
                          {s.ticketId}
                        </span>
                        <span className="truncate text-sm text-slate-700 dark:text-slate-300">
                          {s.name}
                        </span>
                      </div>
                      <StatusBadge status={s.status} />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Details</h2>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400 dark:text-slate-500">Assignees</dt>
                  <dd className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                    <TeamAssigneePicker
                      members={members}
                      selectedIds={pendingAssigneeIds || []}
                      onChange={(ids) => patchPending("assigneeIds", ids)}
                      inline
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400 dark:text-slate-500">Start date</dt>
                  <dd className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                    <InlineField
                      type="date"
                      value={effective("startDate") || ""}
                      onCommit={(v) => patchPending("startDate", v || null)}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400 dark:text-slate-500">Target date</dt>
                  <dd className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">
                    <InlineField
                      type="date"
                      value={effective("targetDate") || ""}
                      onCommit={(v) => patchPending("targetDate", v || null)}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400 dark:text-slate-500">Progress</dt>
                  <dd className="mt-1">
                    {effective("progressAuto") !== false ? (
                      <div className="space-y-1.5">
                        <ProgressBar value={task.progress} />
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            Auto
                          </span>
                          <button
                            onClick={() => patchPending("progressAuto", false)}
                            className="text-xs text-slate-500 underline-offset-2 transition-colors hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
                          >
                            Set manually
                          </button>
                        </div>
                        <p className="text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                          {subtasks.length > 0
                            ? "Averaged across this task's subtasks."
                            : `From the "${effective("status")}" status — change the mapping in Configuration.`}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <InlineField
                          type="number"
                          min={0}
                          max={100}
                          value={effective("progress") ?? 0}
                          onCommit={(v) =>
                            patchPending(
                              "progress",
                              Math.min(100, Math.max(0, Number(v) || 0))
                            )
                          }
                          renderView={(v) => <ProgressBar value={v} />}
                        />
                        <button
                          onClick={() => patchPending("progressAuto", true)}
                          className="text-xs text-slate-500 underline-offset-2 transition-colors hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
                        >
                          Calculate automatically
                        </button>
                      </div>
                    )}
                  </dd>
                </div>
                <Field label="Last update" value={task.lastUpdate || "—"} />
                <div>
                  <dt className="text-xs text-slate-400 dark:text-slate-500">GitHub branch</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                    <GitBranch size={13} className="shrink-0 text-slate-400 dark:text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <InlineField
                        value={effective("githubBranch") === "N/A" ? "" : effective("githubBranch")}
                        onCommit={(v) => patchPending("githubBranch", v.trim() || "N/A")}
                        placeholder="N/A"
                        viewClassName="break-all font-mono text-xs"
                      />
                    </div>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400 dark:text-slate-500">Jira</dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <InlineField
                        value={effective("jiraLink") || ""}
                        onCommit={(v) => patchPending("jiraLink", v.trim() || null)}
                        placeholder="Not linked"
                        viewClassName="break-all text-xs"
                      />
                    </div>
                    {effective("jiraLink") && (
                      <a
                        href={effective("jiraLink")}
                        target="_blank"
                        rel="noreferrer"
                        title="Open in Jira"
                        className="shrink-0 text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </dd>
                </div>
              </dl>
            </section>

            <TaskTimePanel taskId={task.id} scope="team" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700 dark:text-slate-300">{value}</dd>
    </div>
  );
}

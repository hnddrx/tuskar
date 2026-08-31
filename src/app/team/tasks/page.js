"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  X,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { useConfirm } from "@/components/ConfirmProvider";
import { StatusBadge, PriorityBadge, TypeBadge, SyncBadge } from "@/components/Badge";
import { ProgressBar } from "@/components/ProgressBar";
import ScopeBadge from "@/components/ScopeBadge";
import { useNow } from "@/lib/useNow";
import { formatDateTime, formatDuration, totalForTask } from "@/lib/time";
import TeamTaskFormModal from "@/components/TeamTaskFormModal";
import { TEAM_PARAM, resolveTeamScope, tasksForTeam } from "@/lib/teamScope";
import PageHeader from "@/components/PageHeader";
import ColumnsPicker from "@/components/ColumnsPicker";
import TaskFiltersPanel, {
  DEFAULT_FILTERS,
  countActiveFilters,
} from "@/components/TaskFiltersPanel";
import ArchivedToggle from "@/components/ArchivedToggle";
import {
  PAGE_SIZES,
  buildTasksSearch,
  commentsByTaskId,
  orderTasks,
  parseTasksSearchParams,
} from "@/lib/taskList";

const COLUMNS_STORAGE_KEY = "taskar:team-columns:v1";

function assigneeNames(t) {
  return t.assignees?.length ? t.assignees.map((a) => a.name) : [];
}

const ALL_COLUMNS = [
  { key: "ticketId", label: "Ticket", required: true },
  { key: "name", label: "Task", required: true },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignees" },
  { key: "startDate", label: "Start date" },
  { key: "targetDate", label: "Target date" },
  { key: "progress", label: "Progress" },
  { key: "commentCount", label: "Comments" },
  { key: "trackedSeconds", label: "Time" },
  { key: "syncSource", label: "Source" },
  { key: "createdAt", label: "Created" },
  { key: "githubBranch", label: "GitHub branch" },
  { key: "jiraLink", label: "Jira link" },
];

const DEFAULT_VISIBLE_KEYS = [
  "type",
  "status",
  "priority",
  "assignee",
  "targetDate",
  "progress",
  "commentCount",
  "syncSource",
];

const CELL_DEFS = {
  ticketId: {
    className: "whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400",
    render: (t) => t.ticketId,
  },
  name: {
    className: "max-w-xs px-4 py-2.5",
    render: (t, { parent, taskHref }) => (
      <>
        <Link
          href={taskHref(t.id)}
          className="block truncate font-medium text-slate-800 hover:underline transition-colors dark:text-slate-200"
          title={t.name}
        >
          {t.name}
        </Link>
        {t.orgName && (
          <span className="mt-0.5 inline-block">
            <ScopeBadge scope="team" teamName={t.orgName} />
          </span>
        )}
        {parent && (
          <span className="text-xs text-slate-400 dark:text-slate-500">↳ subtask of {parent.ticketId}</span>
        )}
      </>
    ),
  },
  type: {
    className: "px-4 py-2.5",
    render: (t) => <TypeBadge type={t.type} />,
  },
  status: {
    className: "px-4 py-2.5",
    render: (t, { openEdit }) => (
      <button onClick={() => openEdit(t)}>
        <StatusBadge status={t.status} />
      </button>
    ),
  },
  priority: {
    className: "px-4 py-2.5",
    render: (t) => <PriorityBadge priority={t.priority} />,
  },
  assignee: {
    className: "whitespace-nowrap px-4 py-2.5 text-slate-600 dark:text-slate-400",
    render: (t) => (assigneeNames(t).length ? assigneeNames(t).join(", ") : "Unassigned"),
  },
  startDate: {
    className: "whitespace-nowrap px-4 py-2.5 text-slate-500 dark:text-slate-400",
    render: (t) => t.startDate || "—",
  },
  targetDate: {
    className: "whitespace-nowrap px-4 py-2.5 text-slate-500 dark:text-slate-400",
    render: (t) => t.targetDate || "—",
  },
  progress: {
    className: "px-4 py-2.5",
    render: (t) => <ProgressBar value={t.progress} className="w-28" />,
  },
  commentCount: {
    className: "px-4 py-2.5 text-center text-slate-500 dark:text-slate-400",
    render: (t) => t.commentCount || 0,
  },
  trackedSeconds: {
    className: "whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400",
    render: (t) => formatDuration(t.trackedSeconds),
  },
  syncSource: {
    className: "px-4 py-2.5",
    render: (t) => <SyncBadge source={t.syncSource} />,
  },
  createdAt: {
    className: "whitespace-nowrap px-4 py-2.5 text-slate-500 dark:text-slate-400",
    render: (t) => formatDateTime(t.createdAt),
  },
  githubBranch: {
    className: "whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400",
    render: (t) => (t.githubBranch && t.githubBranch !== "N/A" ? t.githubBranch : "—"),
  },
  jiraLink: {
    className: "whitespace-nowrap px-4 py-2.5",
    render: (t) =>
      t.jiraLink ? (
        <a
          href={t.jiraLink}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-blue-600 hover:underline transition-colors"
        >
          Open ↗
        </a>
      ) : (
        <span className="text-slate-400 dark:text-slate-500">—</span>
      ),
  },
};

export default function TeamTasksPage() {
  return (
    <Suspense fallback={<div className="flex-1 p-8 text-sm text-slate-400 dark:text-slate-500">Loading…</div>}>
      <TeamTasksPageInner />
    </Suspense>
  );
}

function TeamTasksPageInner() {
  const {
    team: { allTasks: rawTasks, comments, config, configs, orgs, deleteTask, orgId, can },
    time: { entries: timeEntries },
  } = useTasks();
  // Coarse tick — see the personal table.
  const timeNow = useNow(60000);
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();

  // "?team=" narrows the list to one team; without it you get every team you
  // are in. An id for a team you have left falls back to the wider view.
  const teamScope = resolveTeamScope(searchParams.get(TEAM_PARAM), orgs);
  const scopedOrg = teamScope ? orgs.find((o) => o.id === teamScope) : null;

  const tasks = useMemo(
    () =>
      tasksForTeam(rawTasks, teamScope).map((t) => ({
        ...t,
        trackedSeconds: totalForTask(timeEntries, t.id, timeNow),
      })),
    [rawTasks, teamScope, timeEntries, timeNow]
  );
  const { query, filters, sort, page, pageSize, showArchived } = useMemo(
    () => parseTasksSearchParams(searchParams),
    [searchParams]
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [visibleKeys, setVisibleKeys] = useState(DEFAULT_VISIBLE_KEYS);
  const [columnsHydrated, setColumnsHydrated] = useState(false);

  function pushState(patch) {
    const next = { query, filters, sort, page, pageSize, showArchived, ...patch };
    const params = new URLSearchParams(buildTasksSearch(next));
    if (teamScope) params.set(TEAM_PARAM, teamScope);
    const qs = params.toString();
    router.replace(qs ? `/team/tasks?${qs}` : "/team/tasks", { scroll: false });
  }

  const listSearch = searchParams.toString();
  const fromParams = new URLSearchParams({
    from: listSearch ? `/team/tasks?${listSearch}` : "/team/tasks",
    fromLabel: "Team Tasks",
  }).toString();
  function taskHref(id) {
    return `/team/tasks/${id}?${fromParams}`;
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(parsed)) setVisibleKeys(parsed);
      }
    } catch (err) {
      console.warn("Failed to load column preferences", err);
    }
    setColumnsHydrated(true);
  }, []);

  useEffect(() => {
    if (!columnsHydrated) return;
    try {
      window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(visibleKeys));
    } catch (err) {
      console.warn("Failed to persist column preferences", err);
    }
  }, [visibleKeys, columnsHydrated]);

  const columns = useMemo(
    () => ALL_COLUMNS.filter((c) => c.required || visibleKeys.includes(c.key)),
    [visibleKeys]
  );

  const commentsByTask = useMemo(() => commentsByTaskId(comments), [comments]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const sorted = useMemo(
    () => orderTasks(tasks, { query, filters, sort, showArchived }, commentsByTask, {
      assigneeNames,
    }),
    [tasks, query, filters, sort, showArchived, commentsByTask]
  );
  const archivedCount = useMemo(() => tasks.filter((t) => t.archivedAt).length, [tasks]);

  // How many teams these tasks actually come from — the per-row badge says
  // which one, this says how wide the list is.
  const teamCount = useMemo(
    () => new Set(tasks.map((t) => t.orgId).filter(Boolean)).size || 1,
    [tasks],
  );

  // Statuses and priorities belong to a team, so a scoped list filters by
  // that team's set rather than the selected team's.
  const scopedConfig = (teamScope && configs?.[teamScope]) || config;

  // Where a new task would go: the team on screen, else the selected one.
  const createIn = teamScope || orgId;
  // The routes enforce this too — disabling the control just avoids offering
  // an action that would come back refused. Edit and delete are checked per
  // row instead, against the team that row's task belongs to: this table can
  // show several teams at once.
  const canCreate = can("tasks.create", createIn);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  function updateQuery(v) {
    pushState({ query: v, page: 1 });
  }

  function updateFilters(v) {
    pushState({ filters: v, page: 1 });
  }

  function toggleSort(key) {
    const nextSort =
      sort.key === key ? { key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
    pushState({ sort: nextSort, page: 1 });
  }

  function resetAll() {
    pushState({ query: "", filters: DEFAULT_FILTERS, page: 1 });
  }

  function openEdit(task) {
    setEditing(task);
    setModalOpen(true);
  }

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  const hasActiveQuery = query.trim().length > 0;
  const activeFilterCount = countActiveFilters(filters);

  return (
    <div className="flex-1">
      <PageHeader
        title="Team Tasks"
        scope="team"
        teamName={scopedOrg?.name}
        subtitle={`${sorted.length} of ${tasks.length} task${tasks.length === 1 ? "" : "s"} · ${
          scopedOrg
            ? "shared with everyone on this team"
            : teamCount === 1
              ? "shared with everyone on this team"
              : `across ${teamCount} teams`
        }`}
        actions={
          <button
            onClick={openNew}
            disabled={!createIn || !canCreate}
            title={
              !createIn
                ? "Open a team in the sidebar to add a task to it"
                : canCreate
                  ? undefined
                  : "You don't have permission to add tasks to this team"
            }
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus size={16} /> New task
          </button>
        }
        mobileFab={
          filtersOpen || !canCreate ? undefined : { onClick: openNew, label: "New task" }
        }
      >
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:flex-none sm:w-72">
            <Search
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
            />
            <input
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder="Search tasks, comments, people…"
              className="w-full rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-sm focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:bg-slate-900 dark:focus:border-slate-500"
            />
            {hasActiveQuery && (
              <button
                onClick={() => updateQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors dark:text-slate-500"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <TaskFiltersPanel
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            config={scopedConfig}
            filters={filters}
            onChange={updateFilters}
          />

          {(activeFilterCount > 0 || hasActiveQuery) && (
            <button
              onClick={resetAll}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors dark:text-slate-400 dark:hover:text-slate-100"
            >
              Reset all
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <ArchivedToggle
              count={archivedCount}
              active={showArchived}
              onChange={(v) => pushState({ showArchived: v, page: 1 })}
            />
            <ColumnsPicker
              columns={ALL_COLUMNS}
              visibleKeys={visibleKeys}
              onChange={setVisibleKeys}
            />
            <select
              value={pageSize}
              onChange={(e) => pushState({ pageSize: Number(e.target.value), page: 1 })}
              className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600 focus:border-slate-400 focus:outline-none transition-colors dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:focus:border-slate-500"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n} / page
                </option>
              ))}
            </select>
          </div>
        </div>
      </PageHeader>

      <div className="px-4 py-6 sm:px-8">
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none md:block dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:text-slate-500">
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3">
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="flex items-center gap-1 hover:text-slate-700 transition-colors"
                    >
                      {col.label}
                      {sort.key === col.key ? (
                        sort.dir === "asc" ? (
                          <ArrowUp size={12} />
                        ) : (
                          <ArrowDown size={12} />
                        )
                      ) : (
                        <ArrowUpDown size={11} className="opacity-30" />
                      )}
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => {
                const parent = t.parentId ? tasksById.get(t.parentId) : null;
                return (
                  <tr
                    key={t.id}
                    className="group border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors dark:hover:bg-slate-800"
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={CELL_DEFS[col.key].className}>
                        {CELL_DEFS[col.key].render(t, { parent, openEdit, taskHref })}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100">
                        <button
                          onClick={() => openEdit(t)}
                          disabled={!can("tasks.edit", t.orgId)}
                          title={
                            can("tasks.edit", t.orgId)
                              ? undefined
                              : "You don't have permission to edit tasks in this team"
                          }
                          className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Archive "${t.name}"?`,
                              message: "It moves to the Archive, where you can restore it or delete it for good.",
                              confirmLabel: "Archive",
                            });
                            if (ok) deleteTask(t.id);
                          }}
                          disabled={!can("tasks.delete", t.orgId)}
                          title={
                            can("tasks.delete", t.orgId)
                              ? undefined
                              : "You don't have permission to archive tasks in this team"
                          }
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500"
                  >
                    No tasks match your search and filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 md:hidden">
          {pageItems.map((t) => {
            const parent = t.parentId ? tasksById.get(t.parentId) : null;
            return (
              <Link
                key={t.id}
                href={taskHref(t.id)}
                className="block rounded-xl border border-slate-200 bg-white shadow-sm dark:shadow-none p-3.5 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {t.ticketId}
                  </span>
                  <SyncBadge source={t.syncSource} />
                </div>
                <p className="mb-1 text-sm font-medium text-slate-800 dark:text-slate-200">{t.name}</p>
                {parent && (
                  <p className="mb-1.5 text-xs text-slate-400 dark:text-slate-500">
                    ↳ subtask of {parent.ticketId}
                  </p>
                )}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <TypeBadge type={t.type} />
                  <StatusBadge status={t.status} />
                  <PriorityBadge priority={t.priority} />
                </div>
                <ProgressBar value={t.progress} className="mb-2" />
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{assigneeNames(t).length ? assigneeNames(t).join(", ") : "Unassigned"}</span>
                  <span>{t.targetDate || "No target date"}</span>
                </div>
              </Link>
            );
          })}
          {pageItems.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
              No tasks match your search and filters.
            </div>
          )}
        </div>

        {sorted.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500 dark:text-slate-400">
            <p>
              Showing {(safePage - 1) * pageSize + 1}–
              {Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => pushState({ page: Math.max(1, safePage - 1) })}
                disabled={safePage <= 1}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900"
              >
                Previous
              </button>
              <span className="text-xs">
                Page {safePage} of {totalPages}
              </span>
              <button
                onClick={() => pushState({ page: Math.min(totalPages, safePage + 1) })}
                disabled={safePage >= totalPages}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <TeamTaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editing}
        orgId={createIn}
      />
    </div>
  );
}

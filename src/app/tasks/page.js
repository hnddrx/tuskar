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
import TaskFormModal from "@/components/TaskFormModal";
import PageHeader from "@/components/PageHeader";
import ColumnsPicker from "@/components/ColumnsPicker";
import TaskFiltersPanel, {
  DEFAULT_FILTERS,
  countActiveFilters,
} from "@/components/TaskFiltersPanel";

const PAGE_SIZES = [10, 25, 50, 100];
const COLUMNS_STORAGE_KEY = "taskar:columns:v1";

// Full set of columns the Task Table can show. Ticket/Task are always
// visible (required: true); everything else is optional and toggled via the
// "Columns" picker. Order here is the fixed render order regardless of the
// order columns were turned on.
const ALL_COLUMNS = [
  { key: "ticketId", label: "Ticket", required: true },
  { key: "name", label: "Task", required: true },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignee", label: "Assignee" },
  { key: "startDate", label: "Start date" },
  { key: "targetDate", label: "Target date" },
  { key: "progress", label: "Progress" },
  { key: "commentCount", label: "Comments" },
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
    render: (t) => t.assignee,
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
  syncSource: {
    className: "px-4 py-2.5",
    render: (t) => <SyncBadge source={t.syncSource} />,
  },
  createdAt: {
    className: "whitespace-nowrap px-4 py-2.5 text-slate-500 dark:text-slate-400",
    render: (t) => (t.createdAt ? t.createdAt.slice(0, 10) : "—"),
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

const SORT_DEFAULT = { key: "lastUpdate", dir: "desc" };
const PAGE_SIZE_DEFAULT = 25;

// Task Table's search/filters/sort/page/pageSize live in the URL (not
// useState) so the exact view survives navigation and browser back/forward
// — see docs/superpowers/specs/2026-08-24-breadcrumb-navigation-design.md.
function parseTasksSearchParams(searchParams) {
  return {
    query: searchParams.get("q") || "",
    filters: {
      statuses: searchParams.getAll("status"),
      priorities: searchParams.getAll("priority"),
      assignees: searchParams.getAll("assignee"),
      source: searchParams.get("source") || "all",
      createdFrom: searchParams.get("createdFrom") || "",
      createdTo: searchParams.get("createdTo") || "",
      dueFrom: searchParams.get("dueFrom") || "",
      dueTo: searchParams.get("dueTo") || "",
    },
    sort: {
      key: searchParams.get("sort") || SORT_DEFAULT.key,
      dir: searchParams.get("dir") || SORT_DEFAULT.dir,
    },
    page: Number(searchParams.get("page")) || 1,
    pageSize: Number(searchParams.get("pageSize")) || PAGE_SIZE_DEFAULT,
  };
}

function buildTasksSearch({ query, filters, sort, page, pageSize }) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query);
  filters.statuses.forEach((v) => params.append("status", v));
  filters.priorities.forEach((v) => params.append("priority", v));
  filters.assignees.forEach((v) => params.append("assignee", v));
  if (filters.source !== "all") params.set("source", filters.source);
  if (filters.createdFrom) params.set("createdFrom", filters.createdFrom);
  if (filters.createdTo) params.set("createdTo", filters.createdTo);
  if (filters.dueFrom) params.set("dueFrom", filters.dueFrom);
  if (filters.dueTo) params.set("dueTo", filters.dueTo);
  if (sort.key !== SORT_DEFAULT.key) params.set("sort", sort.key);
  if (sort.dir !== SORT_DEFAULT.dir) params.set("dir", sort.dir);
  if (page !== 1) params.set("page", String(page));
  if (pageSize !== PAGE_SIZE_DEFAULT) params.set("pageSize", String(pageSize));
  return params.toString();
}

function normalize(v) {
  return (v ?? "").toString().toLowerCase();
}

function compareValues(a, b, key) {
  if (key === "progress" || key === "commentCount") {
    return (a[key] || 0) - (b[key] || 0);
  }
  if (key === "targetDate" || key === "startDate") {
    return (a[key] || "9999") < (b[key] || "9999") ? -1 : 1;
  }
  if (key === "createdAt") {
    return (a.createdAt || "") < (b.createdAt || "") ? -1 : 1;
  }
  return normalize(a[key]) < normalize(b[key]) ? -1 : 1;
}

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="flex-1 p-8 text-sm text-slate-400 dark:text-slate-500">Loading…</div>}>
      <TasksPageInner />
    </Suspense>
  );
}

function TasksPageInner() {
  const { personal: { tasks, comments, config, deleteTask } } = useTasks();
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { query, filters, sort, page, pageSize } = useMemo(
    () => parseTasksSearchParams(searchParams),
    [searchParams]
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [visibleKeys, setVisibleKeys] = useState(DEFAULT_VISIBLE_KEYS);
  const [columnsHydrated, setColumnsHydrated] = useState(false);

  // Push a partial state patch into the URL via replace (no new history
  // entry, no scroll jump) so browser back/forward still behaves normally.
  function pushState(patch) {
    const next = { query, filters, sort, page, pageSize, ...patch };
    const qs = buildTasksSearch(next);
    router.replace(qs ? `/tasks?${qs}` : "/tasks", { scroll: false });
  }

  const listSearch = searchParams.toString();
  const fromParams = new URLSearchParams({
    from: listSearch ? `/tasks?${listSearch}` : "/tasks",
    fromLabel: "My Tasks",
  }).toString();
  function taskHref(id) {
    return `/tasks/${id}?${fromParams}`;
  }

  // Load/persist the chosen optional columns per-browser, same pattern as
  // the rest of this app's localStorage-backed state.
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

  const commentsByTask = useMemo(() => {
    const map = new Map();
    for (const c of comments) {
      if (!map.has(c.ticketId)) map.set(c.ticketId, []);
      map.get(c.ticketId).push(c.text);
    }
    return map;
  }, [comments]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return tasks.filter((t) => {
      if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
      if (filters.priorities.length && !filters.priorities.includes(t.priority))
        return false;
      if (filters.assignees.length && !filters.assignees.includes(t.assignee))
        return false;
      if (filters.source === "jira" && t.syncSource !== "Jira") return false;
      if (filters.source === "manual" && t.syncSource === "Jira") return false;

      if (filters.dueFrom && (!t.targetDate || t.targetDate < filters.dueFrom))
        return false;
      if (filters.dueTo && (!t.targetDate || t.targetDate > filters.dueTo))
        return false;

      const createdDate = t.createdAt?.slice(0, 10);
      if (filters.createdFrom && (!createdDate || createdDate < filters.createdFrom))
        return false;
      if (filters.createdTo && (!createdDate || createdDate > filters.createdTo))
        return false;

      if (q) {
        const haystack = [
          t.ticketId,
          t.name,
          t.description,
          t.assignee,
          t.status,
          t.priority,
          ...(commentsByTask.get(t.id) || []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [tasks, query, filters, commentsByTask]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => dir * compareValues(a, b, sort.key));
  }, [filtered, sort]);

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
        title="My Tasks"
        scope="personal"
        subtitle={`${sorted.length} of ${tasks.length} task${tasks.length === 1 ? "" : "s"}`}
        actions={
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus size={16} /> New task
          </button>
        }
        mobileFab={filtersOpen ? undefined : { onClick: openNew, label: "New task" }}
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
            config={config}
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
        {/* Desktop / tablet table */}
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
                          className="rounded px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: `Delete "${t.name}"?`,
                              message: "This cannot be undone.",
                              confirmLabel: "Delete",
                              danger: true,
                            });
                            if (ok) deleteTask(t.id);
                          }}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-slate-500"
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

        {/* Mobile card list */}
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
                  <span>{t.assignee}</span>
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

        {/* Pagination */}
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

      <TaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editing}
      />
    </div>
  );
}

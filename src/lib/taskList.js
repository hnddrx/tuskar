// The Task Table's view state and the ordering it produces.
//
// This lives outside the page components because the record pager on a task's
// detail page has to reproduce the list it was opened from, exactly — same
// filters, same sort — to know which task is "next". Keeping search-param
// parsing, filtering and sorting here means the pager can never drift out of
// step with the table.

import { applyArchiveFilter } from "./archive.js";

export const SORT_DEFAULT = { key: "lastUpdate", dir: "desc" };
export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZES = [10, 25, 50, 100];

// Task Table's search/filters/sort/page/pageSize live in the URL (not
// useState) so the exact view survives navigation and browser back/forward
// — see docs/superpowers/specs/2026-08-24-breadcrumb-navigation-design.md.
export function parseTasksSearchParams(searchParams) {
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
    // In the URL rather than component state on purpose: the record pager on
    // a task's detail page rebuilds this list from these params, and a toggle
    // it could not see would page through a different list than the one on
    // screen.
    showArchived: searchParams.get("archived") === "1",
  };
}

export function buildTasksSearch({ query, filters, sort, page, pageSize, showArchived }) {
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
  if (showArchived) params.set("archived", "1");
  return params.toString();
}

// Comment text keyed by task, so the free-text search can look inside the
// thread as well as the task itself.
export function commentsByTaskId(comments = []) {
  const map = new Map();
  for (const c of comments) {
    if (!map.has(c.ticketId)) map.set(c.ticketId, []);
    map.get(c.ticketId).push(c.text);
  }
  return map;
}

// A personal task carries one assignee name; a team task carries a resolved
// list. Both tables filter and search on "the names on this task".
function defaultAssigneeNames(t) {
  return t.assignee ? [t.assignee] : [];
}

export function normalize(v) {
  return (v ?? "").toString().toLowerCase();
}

export function compareValues(a, b, key, assigneeNames = defaultAssigneeNames) {
  if (
    key === "progress" ||
    key === "commentCount" ||
    key === "noteCount" ||
    key === "trackedSeconds"
  ) {
    return (a[key] || 0) - (b[key] || 0);
  }
  if (key === "targetDate" || key === "startDate") {
    return (a[key] || "9999") < (b[key] || "9999") ? -1 : 1;
  }
  if (key === "createdAt") {
    return (a.createdAt || "") < (b.createdAt || "") ? -1 : 1;
  }
  if (key === "assignee") {
    return normalize(assigneeNames(a).join(", ")) < normalize(assigneeNames(b).join(", ")) ? -1 : 1;
  }
  return normalize(a[key]) < normalize(b[key]) ? -1 : 1;
}

export function filterTasks(tasks, { query, filters, showArchived }, commentsByTask, options = {}) {
  const assigneeNames = options.assigneeNames || defaultAssigneeNames;
  const q = query.trim().toLowerCase();

  return applyArchiveFilter(tasks, showArchived).filter((t) => {
    if (filters.statuses.length && !filters.statuses.includes(t.status)) return false;
    if (filters.priorities.length && !filters.priorities.includes(t.priority)) return false;
    if (
      filters.assignees.length &&
      !assigneeNames(t).some((n) => filters.assignees.includes(n))
    )
      return false;
    if (filters.source === "jira" && t.syncSource !== "Jira") return false;
    if (filters.source === "manual" && t.syncSource === "Jira") return false;

    if (filters.dueFrom && (!t.targetDate || t.targetDate < filters.dueFrom)) return false;
    if (filters.dueTo && (!t.targetDate || t.targetDate > filters.dueTo)) return false;

    const createdDate = t.createdAt?.slice(0, 10);
    if (filters.createdFrom && (!createdDate || createdDate < filters.createdFrom)) return false;
    if (filters.createdTo && (!createdDate || createdDate > filters.createdTo)) return false;

    if (q) {
      const haystack = [
        t.ticketId,
        t.name,
        t.description,
        ...assigneeNames(t),
        t.status,
        t.priority,
        ...(commentsByTask?.get(t.id) || []),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export function sortTasks(tasks, sort, options = {}) {
  const assigneeNames = options.assigneeNames || defaultAssigneeNames;
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...tasks].sort((a, b) => dir * compareValues(a, b, sort.key, assigneeNames));
}

// The list exactly as the table renders it, before paging.
export function orderTasks(tasks, state, commentsByTask, options = {}) {
  return sortTasks(filterTasks(tasks, state, commentsByTask, options), state.sort, options);
}

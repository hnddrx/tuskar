import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTasksSearch,
  commentsByTaskId,
  filterTasks,
  orderTasks,
  parseTasksSearchParams,
  sortTasks,
} from "./taskList.js";
import { pagerFor } from "./recordPager.js";

const DEFAULT_STATE = {
  query: "",
  filters: {
    statuses: [],
    priorities: [],
    assignees: [],
    source: "all",
    createdFrom: "",
    createdTo: "",
    dueFrom: "",
    dueTo: "",
  },
  sort: { key: "lastUpdate", dir: "desc" },
  page: 1,
  pageSize: 25,
  showArchived: false,
};

function task(over) {
  return {
    id: over.id,
    ticketId: over.id.toUpperCase(),
    name: "Task",
    status: "Todo",
    priority: "Medium",
    assignee: "Ann",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUpdate: "2026-01-01",
    ...over,
  };
}

test("the round trip through the URL leaves the view unchanged", () => {
  const state = {
    ...DEFAULT_STATE,
    query: "login",
    filters: { ...DEFAULT_STATE.filters, statuses: ["Todo", "Done"], source: "jira" },
    sort: { key: "priority", dir: "asc" },
    page: 3,
    pageSize: 50,
    showArchived: true,
  };
  const parsed = parseTasksSearchParams(new URLSearchParams(buildTasksSearch(state)));
  assert.deepEqual(parsed, state);
});

test("defaults are left out of the URL entirely", () => {
  assert.equal(buildTasksSearch(DEFAULT_STATE), "");
});

test("filters narrow by status, priority, assignee and source", () => {
  const tasks = [
    task({ id: "a", status: "Done", priority: "High", assignee: "Ann", syncSource: "Jira" }),
    task({ id: "b", status: "Todo", priority: "High", assignee: "Bob" }),
    task({ id: "c", status: "Done", priority: "Low", assignee: "Bob" }),
  ];
  const pick = (filters) =>
    filterTasks(tasks, { ...DEFAULT_STATE, filters: { ...DEFAULT_STATE.filters, ...filters } })
      .map((t) => t.id);

  assert.deepEqual(pick({ statuses: ["Done"] }), ["a", "c"]);
  assert.deepEqual(pick({ priorities: ["High"] }), ["a", "b"]);
  assert.deepEqual(pick({ assignees: ["Bob"] }), ["b", "c"]);
  assert.deepEqual(pick({ source: "jira" }), ["a"]);
  assert.deepEqual(pick({ source: "manual" }), ["b", "c"]);
});

test("search reaches into the task's comments, not just its own fields", () => {
  const tasks = [task({ id: "a" }), task({ id: "b" })];
  const comments = commentsByTaskId([{ ticketId: "b", text: "blocked on the deploy" }]);
  const found = filterTasks(tasks, { ...DEFAULT_STATE, query: "deploy" }, comments);
  assert.deepEqual(found.map((t) => t.id), ["b"]);
});

test("a team task matches on any of its assignees", () => {
  const assigneeNames = (t) => (t.assignees || []).map((a) => a.name);
  const tasks = [
    task({ id: "a", assignee: undefined, assignees: [{ name: "Ann" }, { name: "Bob" }] }),
    task({ id: "b", assignee: undefined, assignees: [{ name: "Cal" }] }),
  ];
  const found = filterTasks(
    tasks,
    { ...DEFAULT_STATE, filters: { ...DEFAULT_STATE.filters, assignees: ["Bob"] } },
    null,
    { assigneeNames }
  );
  assert.deepEqual(found.map((t) => t.id), ["a"]);
});

test("sorting is stable across direction and falls back to a text compare", () => {
  const tasks = [
    task({ id: "a", name: "Beta" }),
    task({ id: "b", name: "alpha" }),
    task({ id: "c", name: "Gamma" }),
  ];
  assert.deepEqual(
    sortTasks(tasks, { key: "name", dir: "asc" }).map((t) => t.id),
    ["b", "a", "c"]
  );
  assert.deepEqual(
    sortTasks(tasks, { key: "name", dir: "desc" }).map((t) => t.id),
    ["c", "a", "b"]
  );
});

test("a task with no target date sorts last, not first", () => {
  const tasks = [
    task({ id: "a", targetDate: "2026-03-01" }),
    task({ id: "b" }),
    task({ id: "c", targetDate: "2026-02-01" }),
  ];
  assert.deepEqual(
    sortTasks(tasks, { key: "targetDate", dir: "asc" }).map((t) => t.id),
    ["c", "a", "b"]
  );
});

test("the pager reports a record's place in the whole filtered list", () => {
  const tasks = [
    task({ id: "a", name: "A", status: "Todo" }),
    task({ id: "b", name: "B", status: "Done" }),
    task({ id: "c", name: "C", status: "Todo" }),
  ];
  const state = {
    ...DEFAULT_STATE,
    filters: { ...DEFAULT_STATE.filters, statuses: ["Todo"] },
    sort: { key: "name", dir: "asc" },
  };
  const ordered = orderTasks(tasks, state);

  const first = pagerFor(ordered, "a");
  assert.equal(first.index, 0);
  assert.equal(first.total, 2);
  assert.equal(first.prev, null);
  assert.equal(first.next.id, "c");

  const last = pagerFor(ordered, "c");
  assert.equal(last.index, 1);
  assert.equal(last.prev.id, "a");
  assert.equal(last.next, null);
});

test("a task filtered out of the list has no place in it", () => {
  const tasks = [task({ id: "a", status: "Todo" }), task({ id: "b", status: "Done" })];
  const ordered = orderTasks(tasks, {
    ...DEFAULT_STATE,
    filters: { ...DEFAULT_STATE.filters, statuses: ["Todo"] },
  });
  assert.equal(pagerFor(ordered, "b"), null);
});

test("a list hides archived tasks unless it is asked to show them", () => {
  const tasks = [
    task({ id: "a", name: "Live" }),
    task({ id: "b", name: "Gone", archivedAt: "2026-08-30T10:00:00.000Z" }),
  ];
  const ordered = (showArchived) =>
    orderTasks(tasks, { ...DEFAULT_STATE, showArchived, sort: { key: "name", dir: "asc" } })
      .map((t) => t.id);

  assert.deepEqual(ordered(false), ["a"]);
  assert.deepEqual(ordered(true), ["b", "a"]);
});

test("showing the archive puts archived tasks back in the sort, not at the end", () => {
  const tasks = [
    task({ id: "a", name: "Charlie" }),
    task({ id: "b", name: "Alpha", archivedAt: "2026-08-30T10:00:00.000Z" }),
    task({ id: "c", name: "Bravo" }),
  ];
  const ordered = orderTasks(tasks, {
    ...DEFAULT_STATE,
    showArchived: true,
    sort: { key: "name", dir: "asc" },
  });
  assert.deepEqual(ordered.map((t) => t.id), ["b", "c", "a"]);
});

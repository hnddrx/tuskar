import test from "node:test";
import assert from "node:assert/strict";

import { isOpenTask, summariseByTeam, summariseTasks } from "./teamSummary.js";

const ME = "user_me";
const TODAY = new Date("2026-08-31T00:00:00.000Z");
const ORGS = [
  { id: "org_a", name: "HRS Graduate" },
  { id: "org_b", name: "staging" },
  { id: "org_c", name: "Acme Ltd" },
];

const TASKS = [
  { orgId: "org_a", status: "In Progress", priority: "High", assigneeIds: [ME], targetDate: "2026-08-01" },
  { orgId: "org_a", status: "Done", priority: "Critical", assigneeIds: [ME], targetDate: "2026-08-01" },
  { orgId: "org_a", status: "To Do", priority: "Normal", assigneeIds: [], targetDate: null },
  { orgId: "org_b", status: "To Do", priority: "Normal", assigneeIds: ["user_other"], targetDate: "2026-12-01" },
  { orgId: "org_b", status: "Cancelled", priority: "Normal", assigneeIds: [ME], targetDate: null },
];

const OPTS = { userId: ME, today: TODAY };

test("done statuses are not open work", () => {
  assert.equal(isOpenTask({ status: "To Do" }), true);
  assert.equal(isOpenTask({ status: "Done" }), false);
  assert.equal(isOpenTask({ status: "Completed" }), false);
  assert.equal(isOpenTask({ status: "Cancelled" }), false);
  assert.equal(isOpenTask({}), true);
  assert.equal(isOpenTask(), true);
});

test("the totals count open and finished work separately", () => {
  const s = summariseTasks(TASKS, OPTS);
  assert.equal(s.total, 5);
  assert.equal(s.open, 3);
  assert.equal(s.done, 2);
});

test("a finished task is not mine to do, however it is flagged", () => {
  // Two of the tasks assigned to me are Done and Cancelled; only the open one
  // is still work.
  assert.equal(summariseTasks(TASKS, OPTS).assignedToMe, 1);
});

test("a finished task is neither high priority nor overdue", () => {
  const s = summariseTasks(TASKS, OPTS);
  // The Critical one is Done, so only the open High counts.
  assert.equal(s.highPriority, 1);
  // The Done task's target date is in the past, but it landed — that is a
  // different question from being overdue.
  assert.equal(s.overdue, 1);
});

test("a task with no target date is never overdue", () => {
  const s = summariseTasks(
    [{ status: "To Do", priority: "Normal", assigneeIds: [], targetDate: null }],
    OPTS
  );
  assert.equal(s.overdue, 0);
});

test("counting nothing gives zeros, not NaN", () => {
  assert.deepEqual(summariseTasks([], OPTS), {
    total: 0,
    open: 0,
    done: 0,
    assignedToMe: 0,
    highPriority: 0,
    overdue: 0,
  });
  assert.equal(summariseTasks().total, 0);
});

test("each team gets its own numbers, in the order the teams are given", () => {
  // The sidebar lists teams in this order, so the Overview must too.
  const rows = summariseByTeam(TASKS, ORGS, OPTS);
  assert.deepEqual(rows.map((r) => r.name), ["HRS Graduate", "staging", "Acme Ltd"]);
  assert.equal(rows[0].open, 2);
  assert.equal(rows[1].open, 1);
});

test("a team with nothing in it still gets a row", () => {
  // No row would read as "you are not in that team" rather than "nothing yet".
  const acme = summariseByTeam(TASKS, ORGS, OPTS).find((r) => r.id === "org_c");
  assert.ok(acme);
  assert.equal(acme.total, 0);
  assert.equal(acme.open, 0);
});

test("the per-team rows add up to the total above them", () => {
  // A breakdown that did not reconcile with its own heading would be worse
  // than showing no breakdown at all.
  const total = summariseTasks(TASKS, OPTS);
  const rows = summariseByTeam(TASKS, ORGS, OPTS);
  for (const key of ["total", "open", "done", "assignedToMe", "highPriority", "overdue"]) {
    const summed = rows.reduce((n, r) => n + r[key], 0);
    assert.equal(summed, total[key], `${key} does not reconcile`);
  }
});

test("teams are told apart by id, not by name", () => {
  const sameName = [
    { id: "org_a", name: "Duplicate" },
    { id: "org_b", name: "Duplicate" },
  ];
  const rows = summariseByTeam(TASKS, sameName, OPTS);
  assert.equal(rows[0].open, 2);
  assert.equal(rows[1].open, 1);
});

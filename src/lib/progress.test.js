import test from "node:test";
import assert from "node:assert/strict";

import { computeProgress, DEFAULT_STATUS_PROGRESS } from "./progress.js";

// Minimal task factory — only the fields computeProgress actually reads.
function task(id, over = {}) {
  return {
    id,
    parentId: null,
    status: "Not Started",
    progress: 0,
    progressAuto: true,
    ...over,
  };
}

test("a leaf task takes its percent from the status map", () => {
  const t = task("a", { status: "In Progress" });
  assert.equal(computeProgress(t, [t], { "In Progress": 50 }), 50);
});

test("a leaf task with an unmapped status keeps its stored progress", () => {
  const t = task("a", { status: "Homegrown Status", progress: 42 });
  assert.equal(computeProgress(t, [t], { "In Progress": 50 }), 42);
});

test("a parent averages the computed progress of its subtasks", () => {
  const parent = task("p");
  const kids = [
    task("c1", { parentId: "p", status: "Done" }),
    task("c2", { parentId: "p", status: "Done" }),
    task("c3", { parentId: "p", status: "In Progress" }),
  ];
  const all = [parent, ...kids];
  // (100 + 100 + 50) / 3 = 83.33 -> 83
  assert.equal(computeProgress(parent, all, DEFAULT_STATUS_PROGRESS), 83);
});

test("cancelled subtasks are excluded from a parent's average", () => {
  const parent = task("p");
  const all = [
    parent,
    task("c1", { parentId: "p", status: "Done" }),
    task("c2", { parentId: "p", status: "Done" }),
    task("c3", { parentId: "p", status: "Cancelled" }),
  ];
  assert.equal(computeProgress(parent, all, DEFAULT_STATUS_PROGRESS), 100);
});

test("a parent whose subtasks are all cancelled falls back to its own status", () => {
  const parent = task("p", { status: "In Progress" });
  const all = [parent, task("c1", { parentId: "p", status: "Cancelled" })];
  assert.equal(computeProgress(parent, all, { "In Progress": 50 }), 50);
});

test("progress rolls up through grandchildren", () => {
  const all = [
    task("epic"),
    task("p1", { parentId: "epic" }),
    task("g1", { parentId: "p1", status: "Done" }),
    task("g2", { parentId: "p1", status: "Not Started" }),
  ];
  // p1 = (100 + 0) / 2 = 50, so epic = 50
  assert.equal(computeProgress(all[0], all, DEFAULT_STATUS_PROGRESS), 50);
});

test("a task with auto turned off keeps its manual value", () => {
  const t = task("a", { status: "Done", progress: 30, progressAuto: false });
  assert.equal(computeProgress(t, [t], DEFAULT_STATUS_PROGRESS), 30);
});

test("a manual parent ignores its subtasks", () => {
  const parent = task("p", { progress: 10, progressAuto: false });
  const all = [parent, task("c1", { parentId: "p", status: "Done" })];
  assert.equal(computeProgress(parent, all, DEFAULT_STATUS_PROGRESS), 10);
});

test("a parent cycle resolves instead of hanging", () => {
  const a = task("a", { parentId: "b" });
  const b = task("b", { parentId: "a" });
  assert.equal(computeProgress(a, [a, b], DEFAULT_STATUS_PROGRESS), 0);
});

test("percentages are clamped into 0-100", () => {
  const t = task("a", { status: "Weird", progress: 500 });
  assert.equal(computeProgress(t, [t], {}), 100);
  const u = task("b", { status: "Weird", progress: -20 });
  assert.equal(computeProgress(u, [u], {}), 0);
});

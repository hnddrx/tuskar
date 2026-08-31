import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDate,
  formatDateTime,
  formatDuration,
  entrySeconds,
  totalSeconds,
  totalForTask,
  groupByDay,
  isRunning,
} from "./time.js";

const NOW = "2026-08-29T10:00:00.000Z";

function entry(over = {}) {
  return {
    id: "te_1",
    taskId: null,
    startedAt: "2026-08-29T09:00:00.000Z",
    endedAt: "2026-08-29T09:30:00.000Z",
    durationSeconds: 1800,
    ...over,
  };
}

// --- formatDuration --------------------------------------------------------

test("under a minute reads in seconds", () => {
  assert.equal(formatDuration(45), "45s");
});

test("under an hour reads in whole minutes", () => {
  assert.equal(formatDuration(12 * 60), "12m");
});

test("an hour or more reads as hours and minutes", () => {
  assert.equal(formatDuration(3600 + 23 * 60), "1h 23m");
});

test("a whole number of hours omits the minutes", () => {
  assert.equal(formatDuration(2 * 3600), "2h");
});

test("zero and nonsense render as a dash rather than NaN", () => {
  assert.equal(formatDuration(0), "—");
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(undefined), "—");
  assert.equal(formatDuration(-5), "—");
});

// --- entrySeconds ----------------------------------------------------------

test("a finished entry uses its recorded duration", () => {
  assert.equal(entrySeconds(entry(), NOW), 1800);
});

test("a running entry is measured against now", () => {
  const running = entry({ endedAt: null, durationSeconds: null });
  // 09:00 -> 10:00
  assert.equal(entrySeconds(running, NOW), 3600);
});

test("a running entry started in the future never reports negative time", () => {
  const running = entry({
    startedAt: "2026-08-29T11:00:00.000Z",
    endedAt: null,
    durationSeconds: null,
  });
  assert.equal(entrySeconds(running, NOW), 0);
});

test("a finished entry with no recorded duration falls back to its timestamps", () => {
  const odd = entry({ durationSeconds: null });
  assert.equal(entrySeconds(odd, NOW), 1800);
});

// --- isRunning -------------------------------------------------------------

test("an entry with no end time is running", () => {
  assert.equal(isRunning(entry({ endedAt: null })), true);
  assert.equal(isRunning(entry()), false);
});

// --- totals ----------------------------------------------------------------

test("totals add up finished and running entries together", () => {
  const entries = [
    entry({ id: "a", durationSeconds: 600 }),
    entry({ id: "b", endedAt: null, durationSeconds: null }), // 3600 against NOW
  ];
  assert.equal(totalSeconds(entries, NOW), 4200);
});

test("a total over no entries is zero, not NaN", () => {
  assert.equal(totalSeconds([], NOW), 0);
});

test("a task total counts only that task's entries", () => {
  const entries = [
    entry({ id: "a", taskId: "task_1", durationSeconds: 600 }),
    entry({ id: "b", taskId: "task_2", durationSeconds: 900 }),
    entry({ id: "c", taskId: null, durationSeconds: 100 }),
  ];
  assert.equal(totalForTask(entries, "task_1", NOW), 600);
});

// --- groupByDay ------------------------------------------------------------

test("entries group under their start date, newest day first", () => {
  const entries = [
    entry({ id: "a", startedAt: "2026-08-27T09:00:00.000Z" }),
    entry({ id: "b", startedAt: "2026-08-29T09:00:00.000Z" }),
    entry({ id: "c", startedAt: "2026-08-27T14:00:00.000Z" }),
  ];
  const days = groupByDay(entries);
  assert.deepEqual(
    days.map((d) => d.date),
    ["2026-08-29", "2026-08-27"]
  );
  assert.equal(days[1].entries.length, 2);
});

test("each day carries its own total", () => {
  const entries = [
    entry({ id: "a", startedAt: "2026-08-27T09:00:00.000Z", durationSeconds: 600 }),
    entry({ id: "c", startedAt: "2026-08-27T14:00:00.000Z", durationSeconds: 900 }),
  ];
  assert.equal(groupByDay(entries, NOW)[0].seconds, 1500);
});

test("grouping nothing yields no days", () => {
  assert.deepEqual(groupByDay([]), []);
});

// ---------------------------------------------------------------------
// Timestamps — one formatter, used everywhere a record shows when it began
// ---------------------------------------------------------------------

test("a creation stamp keeps its time, not just its date", () => {
  // The whole point: the task tables used to slice the stamp to ten
  // characters and lose the clock time entirely.
  const shown = formatDateTime("2026-08-31T09:54:11.107Z");
  assert.match(shown, /2026/);
  assert.match(shown, /Aug/);
  // Hours and minutes survive, whichever way the locale orders them.
  assert.match(shown, /\d{1,2}:\d{2}/);
});

test("the year is always shown, so an old record is never ambiguous", () => {
  assert.match(formatDateTime("2025-12-12T14:07:00.000Z"), /2025/);
  assert.match(formatDateTime("2026-01-01T00:00:00.000Z"), /2026/);
});

test("a missing or malformed stamp reads as a gap, not as Invalid Date", () => {
  assert.equal(formatDateTime(null), "—");
  assert.equal(formatDateTime(undefined), "—");
  assert.equal(formatDateTime(""), "—");
  assert.equal(formatDateTime("not a date"), "—");
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate("not a date"), "—");
});

test("the date-only form carries no clock time", () => {
  const shown = formatDate("2026-08-31T09:54:11.107Z");
  assert.match(shown, /2026/);
  assert.doesNotMatch(shown, /\d{1,2}:\d{2}/);
});

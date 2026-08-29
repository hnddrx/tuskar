import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_POMODORO,
  phaseAfter,
  phaseSeconds,
  phaseLabel,
  remainingSeconds,
  formatCountdown,
  resumeStartedAt,
} from "./pomodoro.js";

// --- phase progression -----------------------------------------------------

test("a finished work interval leads to a short break", () => {
  assert.equal(phaseAfter("work", 1, DEFAULT_POMODORO), "shortBreak");
});

test("every fourth work interval earns a long break", () => {
  assert.equal(phaseAfter("work", 4, DEFAULT_POMODORO), "longBreak");
  assert.equal(phaseAfter("work", 8, DEFAULT_POMODORO), "longBreak");
});

test("the third work interval still gets a short break", () => {
  assert.equal(phaseAfter("work", 3, DEFAULT_POMODORO), "shortBreak");
});

test("any break leads back to work", () => {
  assert.equal(phaseAfter("shortBreak", 2, DEFAULT_POMODORO), "work");
  assert.equal(phaseAfter("longBreak", 4, DEFAULT_POMODORO), "work");
});

test("the long-break interval is configurable", () => {
  const every3 = { ...DEFAULT_POMODORO, longBreakEvery: 3 };
  assert.equal(phaseAfter("work", 3, every3), "longBreak");
  assert.equal(phaseAfter("work", 4, every3), "shortBreak");
});

// --- phase durations -------------------------------------------------------

test("the default intervals are 25, 5 and 15 minutes", () => {
  assert.equal(phaseSeconds("work", DEFAULT_POMODORO), 25 * 60);
  assert.equal(phaseSeconds("shortBreak", DEFAULT_POMODORO), 5 * 60);
  assert.equal(phaseSeconds("longBreak", DEFAULT_POMODORO), 15 * 60);
});

test("custom interval lengths are respected", () => {
  const custom = { ...DEFAULT_POMODORO, workMinutes: 50, shortBreakMinutes: 10 };
  assert.equal(phaseSeconds("work", custom), 50 * 60);
  assert.equal(phaseSeconds("shortBreak", custom), 10 * 60);
});

test("an unknown phase falls back to the work interval rather than zero", () => {
  assert.equal(phaseSeconds("nonsense", DEFAULT_POMODORO), 25 * 60);
});

// --- labels ----------------------------------------------------------------

test("each phase has a human label", () => {
  assert.equal(phaseLabel("work"), "Focus");
  assert.equal(phaseLabel("shortBreak"), "Short break");
  assert.equal(phaseLabel("longBreak"), "Long break");
});

// --- countdown -------------------------------------------------------------

test("a countdown reports the time left in the phase", () => {
  const startedAt = "2026-08-29T10:00:00.000Z";
  const now = "2026-08-29T10:05:00.000Z";
  assert.equal(remainingSeconds("work", startedAt, now, DEFAULT_POMODORO), 20 * 60);
});

test("a countdown stops at zero rather than going negative", () => {
  const startedAt = "2026-08-29T10:00:00.000Z";
  const now = "2026-08-29T11:00:00.000Z";
  assert.equal(remainingSeconds("work", startedAt, now, DEFAULT_POMODORO), 0);
});

test("a countdown that has not started reports the whole phase", () => {
  assert.equal(remainingSeconds("shortBreak", null, "2026-08-29T10:00:00.000Z", DEFAULT_POMODORO), 5 * 60);
});

// --- countdown face --------------------------------------------------------

test("the countdown face is zero-padded minutes and seconds", () => {
  assert.equal(formatCountdown(25 * 60), "25:00");
  assert.equal(formatCountdown(9 * 60 + 5), "09:05");
  assert.equal(formatCountdown(59), "00:59");
});

test("the countdown face never shows a negative time", () => {
  assert.equal(formatCountdown(-30), "00:00");
  assert.equal(formatCountdown(null), "00:00");
});

test("the countdown face keeps counting past an hour in minutes", () => {
  assert.equal(formatCountdown(90 * 60), "90:00");
});

// --- pause / resume --------------------------------------------------------

test("resuming keeps the time that was left when paused", () => {
  // 10 minutes left on a 25 minute phase means 15 minutes have already run,
  // so the resumed phase must look like it started 15 minutes ago.
  const now = "2026-08-29T10:00:00.000Z";
  const startedAt = resumeStartedAt("work", 10 * 60, now, DEFAULT_POMODORO);
  assert.equal(startedAt, "2026-08-29T09:45:00.000Z");
  assert.equal(remainingSeconds("work", startedAt, now, DEFAULT_POMODORO), 10 * 60);
});

test("resuming an untouched phase starts it from now", () => {
  const now = "2026-08-29T10:00:00.000Z";
  assert.equal(resumeStartedAt("work", 25 * 60, now, DEFAULT_POMODORO), now);
});

test("a remaining time longer than the phase cannot rewind the start", () => {
  const now = "2026-08-29T10:00:00.000Z";
  assert.equal(resumeStartedAt("work", 99 * 60, now, DEFAULT_POMODORO), now);
});

test("resuming with no time left leaves the phase finished", () => {
  const now = "2026-08-29T10:00:00.000Z";
  const startedAt = resumeStartedAt("work", 0, now, DEFAULT_POMODORO);
  assert.equal(remainingSeconds("work", startedAt, now, DEFAULT_POMODORO), 0);
});

test("pause and resume survive a break phase too", () => {
  const now = "2026-08-29T10:00:00.000Z";
  const startedAt = resumeStartedAt("shortBreak", 2 * 60, now, DEFAULT_POMODORO);
  assert.equal(remainingSeconds("shortBreak", startedAt, now, DEFAULT_POMODORO), 2 * 60);
});

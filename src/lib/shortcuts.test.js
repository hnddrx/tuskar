import test from "node:test";
import assert from "node:assert/strict";

import {
  findConflicts,
  formatShortcut,
  groupShortcuts,
  isTypingTarget,
  normalizeShortcutKey,
  pickShortcut,
} from "./shortcuts.js";

test("a shortcut key is one printable character, however it is given", () => {
  assert.equal(normalizeShortcutKey("N"), "n");
  assert.equal(normalizeShortcutKey(" n "), "n");
  assert.equal(normalizeShortcutKey("/"), "/");
});

test("named keys are not shortcuts, since they already do something", () => {
  // Binding Alt+Enter or Alt+Tab would fight behaviour the key already has.
  assert.equal(normalizeShortcutKey("Enter"), null);
  assert.equal(normalizeShortcutKey("Tab"), null);
  assert.equal(normalizeShortcutKey(""), null);
  assert.equal(normalizeShortcutKey(undefined), null);
  assert.equal(normalizeShortcutKey(null), null);
});

test("a shortcut is written the same way wherever it is shown", () => {
  assert.equal(formatShortcut("n"), "Alt+N");
  assert.equal(formatShortcut("/"), "Alt+/");
  assert.equal(formatShortcut("Enter"), "");
});

test("typing is not driving the app", () => {
  // Alt+letter is how some layouts produce accented characters.
  assert.equal(isTypingTarget({ tagName: "INPUT" }), true);
  assert.equal(isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.equal(isTypingTarget({ tagName: "DIV" }), false);
  assert.equal(isTypingTarget(null), false);
});

test("a page shortcut beats a global one on the same key", () => {
  // This is what lets N mean "new task" here and "new note" there without
  // either page knowing about the other.
  const regs = [
    { key: "n", scope: "global", label: "Notes" },
    { key: "n", scope: "page", label: "New task" },
  ];
  assert.equal(pickShortcut(regs, "n").label, "New task");
});

test("the most recently registered of equals wins", () => {
  // A modal registers over the page beneath it, and is what you are looking at.
  const regs = [
    { key: "s", scope: "page", label: "Search" },
    { key: "s", scope: "page", label: "Save (modal)" },
  ];
  assert.equal(pickShortcut(regs, "s").label, "Save (modal)");
});

test("an unclaimed key matches nothing", () => {
  const regs = [{ key: "n", scope: "page", label: "New" }];
  assert.equal(pickShortcut(regs, "z"), null);
  assert.equal(pickShortcut(regs, "Enter"), null);
  assert.equal(pickShortcut([], "n"), null);
  assert.equal(pickShortcut(undefined, "n"), null);
});

test("matching ignores case, so Alt+Shift still finds the shortcut", () => {
  const regs = [{ key: "n", scope: "page", label: "New" }];
  assert.equal(pickShortcut(regs, "N").label, "New");
});

test("two controls claiming one key in one scope is a conflict", () => {
  // Only one of them could ever fire, so this is a mistake worth catching.
  const conflicts = findConflicts([
    { key: "n", scope: "page", label: "New task" },
    { key: "n", scope: "page", label: "New note" },
  ]);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].labels, ["New task", "New note"]);
});

test("the same key in different scopes is not a conflict", () => {
  assert.deepEqual(
    findConflicts([
      { key: "n", scope: "global", label: "Notes" },
      { key: "n", scope: "page", label: "New task" },
    ]),
    []
  );
});

test("the cheatsheet groups by scope and reads in key order", () => {
  const grouped = groupShortcuts([
    { key: "t", scope: "global", label: "Time" },
    { key: "c", scope: "global", label: "Calendar" },
    { key: "n", scope: "page", label: "New task" },
    { key: "Enter", scope: "page", label: "not a shortcut" },
  ]);
  assert.deepEqual(grouped.global.map((s) => s.key), ["c", "t"]);
  assert.deepEqual(grouped.page.map((s) => s.label), ["New task"]);
});

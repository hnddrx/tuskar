import test from "node:test";
import assert from "node:assert/strict";

import { shouldOpenRow } from "./rowOpen.js";

test("an ordinary click on a row opens the record", () => {
  assert.equal(shouldOpenRow({}), true);
  assert.equal(shouldOpenRow(), true);
});

test("a click on a control inside the row belongs to the control", () => {
  // The row's own Edit and Archive buttons, and its name link, must keep
  // doing their job rather than also opening the record behind them.
  assert.equal(shouldOpenRow({ interactive: true }), false);
});

test("finishing a text selection does not open anything", () => {
  // Dragging across a row to copy a ticket id ends in a click.
  assert.equal(shouldOpenRow({ selecting: true }), false);
});

test("a modified click is left to the browser", () => {
  // Ctrl, meta, shift and alt mean "open elsewhere" on a real link. A row is
  // not one, so it does nothing rather than something unasked for.
  assert.equal(shouldOpenRow({ modified: true }), false);
});

test("any one reason to stand aside is enough", () => {
  assert.equal(shouldOpenRow({ interactive: true, selecting: true, modified: true }), false);
  assert.equal(shouldOpenRow({ interactive: false, selecting: true, modified: false }), false);
});

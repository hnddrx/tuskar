import test from "node:test";
import assert from "node:assert/strict";

import { boardColumns, dropUpdate, NO_STATUS } from "./board.js";

const STATUSES = ["To Do", "In Progress", "Done"];

function task(id, status) {
  return { id, status };
}

test("every configured status gets a column, in configuration order", () => {
  const columns = boardColumns(STATUSES, []);
  assert.deepEqual(columns.map((c) => c.status), STATUSES);
  assert.ok(columns.every((c) => c.configured));
  assert.ok(columns.every((c) => c.tasks.length === 0));
});

test("each task lands in its own column", () => {
  const columns = boardColumns(STATUSES, [
    task("a", "To Do"),
    task("b", "Done"),
    task("c", "To Do"),
  ]);
  assert.deepEqual(columns[0].tasks.map((t) => t.id), ["a", "c"]);
  assert.deepEqual(columns[1].tasks.map((t) => t.id), []);
  assert.deepEqual(columns[2].tasks.map((t) => t.id), ["b"]);
});

test("a task whose status the team no longer lists is still on the board", () => {
  const columns = boardColumns(STATUSES, [task("a", "To Do"), task("stray", "Retired")]);
  assert.deepEqual(columns.map((c) => c.status), [...STATUSES, "Retired"]);
  const retired = columns.at(-1);
  assert.equal(retired.configured, false);
  assert.deepEqual(retired.tasks.map((t) => t.id), ["stray"]);
});

test("no task is ever dropped from the board", () => {
  const tasks = [task("a", "To Do"), task("b", "Retired"), task("c", null), task("d", "Done")];
  const columns = boardColumns(STATUSES, tasks);
  const laidOut = columns.flatMap((c) => c.tasks.map((t) => t.id));
  assert.deepEqual(laidOut.sort(), ["a", "b", "c", "d"]);
});

test("a task with no status at all is filed rather than lost", () => {
  const columns = boardColumns(STATUSES, [task("a", null), task("b", "   "), task("c", undefined)]);
  const none = columns.at(-1);
  assert.equal(none.status, NO_STATUS);
  assert.equal(none.configured, false);
  assert.deepEqual(none.tasks.map((t) => t.id), ["a", "b", "c"]);
});

test("a duplicated status draws one column, not two holding the same cards", () => {
  const columns = boardColumns(["To Do", "To Do", "Done"], [task("a", "To Do")]);
  assert.deepEqual(columns.map((c) => c.status), ["To Do", "Done"]);
  assert.deepEqual(columns[0].tasks.map((t) => t.id), ["a"]);
});

test("a blank or non-string status in the configuration is not a column", () => {
  const columns = boardColumns(["To Do", "", "  ", null, 7, "Done"], []);
  assert.deepEqual(columns.map((c) => c.status), ["To Do", "Done"]);
});

test("a board with nothing configured still shows the work that exists", () => {
  const columns = boardColumns([], [task("a", "In Progress")]);
  assert.deepEqual(columns.map((c) => c.status), ["In Progress"]);
  assert.equal(columns[0].configured, false);
});

test("a drop onto another column moves the card", () => {
  const tasks = [task("a", "To Do")];
  assert.deepEqual(dropUpdate(tasks, "a", "Done"), { id: "a", patch: { status: "Done" } });
});

test("a drop back where the card came from writes nothing", () => {
  assert.equal(dropUpdate([task("a", "To Do")], "a", "To Do"), null);
});

test("a drop with no card in hand writes nothing", () => {
  assert.equal(dropUpdate([task("a", "To Do")], null, "Done"), null);
});

test("a card that has gone since it was picked up is not moved", () => {
  assert.equal(dropUpdate([task("a", "To Do")], "vanished", "Done"), null);
  assert.equal(dropUpdate([], "a", "Done"), null);
});

test("a statusless card is moved onto a real column", () => {
  assert.deepEqual(dropUpdate([task("a", null)], "a", "To Do"), {
    id: "a",
    patch: { status: "To Do" },
  });
});

test("a statusless card dropped back into its own bucket writes nothing", () => {
  assert.equal(dropUpdate([task("a", null)], "a", NO_STATUS), null);
});

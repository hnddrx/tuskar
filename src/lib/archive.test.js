import test from "node:test";
import assert from "node:assert/strict";

import {
  ARCHIVE_TYPES,
  ARCHIVE_TYPE_KEYS,
  applyArchiveFilter,
  archiveById,
  archiveWhere,
  archiveTypeOf,
  isArchived,
  onlyArchived,
  withoutArchived,
} from "./archive.js";

const LIVE = { id: "a", archivedAt: null };
const ARCHIVED = { id: "b", archivedAt: "2026-08-30T10:00:00.000Z" };
const OLDER = { id: "c", archivedAt: "2026-08-01T10:00:00.000Z" };

test("a record is archived only once it carries a stamp", () => {
  assert.equal(isArchived(LIVE), false);
  assert.equal(isArchived(ARCHIVED), true);
  assert.equal(isArchived({ id: "d" }), false);
  assert.equal(isArchived(undefined), false);
});

test("the live set is everything without a stamp", () => {
  assert.deepEqual(withoutArchived([LIVE, ARCHIVED]).map((r) => r.id), ["a"]);
  assert.deepEqual(withoutArchived([]), []);
  assert.deepEqual(withoutArchived(), []);
});

test("the archive reads newest-archived first, whatever order it arrives in", () => {
  assert.deepEqual(onlyArchived([OLDER, LIVE, ARCHIVED]).map((r) => r.id), ["b", "c"]);
});

test("showing the archive adds to the list rather than replacing it", () => {
  const records = [LIVE, ARCHIVED];
  assert.deepEqual(applyArchiveFilter(records, true).map((r) => r.id), ["a", "b"]);
  assert.deepEqual(applyArchiveFilter(records, false).map((r) => r.id), ["a"]);
  assert.deepEqual(applyArchiveFilter(records).map((r) => r.id), ["a"]);
});

test("a path segment resolves to a record type only if it is one of ours", () => {
  assert.equal(archiveTypeOf("task").table, "tasks");
  assert.equal(archiveTypeOf("teamTask").table, "team_tasks");
  assert.equal(archiveTypeOf("nope"), null);
  assert.equal(archiveTypeOf(""), null);
  assert.equal(archiveTypeOf(undefined), null);
});

test("an inherited property is not a record type — the table name reaches SQL", () => {
  // archiveTypeOf interpolates `table` into a query, so a lookup that walked
  // the prototype chain would turn "constructor" into a table name.
  assert.equal(archiveTypeOf("constructor"), null);
  assert.equal(archiveTypeOf("toString"), null);
  assert.equal(archiveTypeOf("__proto__"), null);
});

test("every record type names a table and a scope the archive route can enforce", () => {
  for (const key of ARCHIVE_TYPE_KEYS) {
    const type = ARCHIVE_TYPES[key];
    assert.ok(type.table, `${key} has no table`);
    assert.match(type.table, /^[a-z_]+$/, `${key} table is not a plain identifier`);
    assert.ok(["user", "org"].includes(type.scope), `${key} has no usable scope`);
    assert.ok(type.label && type.plural, `${key} has no label`);
  }
});

// ---------------------------------------------------------------------
// Stamping — what a list does the moment something is deleted
// ---------------------------------------------------------------------

test("stamping a record by id archives it in place rather than removing it", () => {
  const records = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const next = archiveById(records, "b", "2026-08-31T09:00:00.000Z");

  assert.deepEqual(next.map((r) => r.id), ["a", "b", "c"]);
  assert.equal(next[1].archivedAt, "2026-08-31T09:00:00.000Z");
  assert.equal(next[0].archivedAt, undefined);
});

test("stamping leaves the records it does not touch untouched, by identity", () => {
  // The list feeds `useMemo` selectors all over the app; re-creating every
  // object would invalidate them for records that did not change.
  const records = [{ id: "a" }, { id: "b" }];
  const next = archiveById(records, "b", "2026-08-31T09:00:00.000Z");
  assert.equal(next[0], records[0]);
  assert.notEqual(next[1], records[1]);
});

test("stamping an id that is not there changes nothing", () => {
  const records = [{ id: "a" }];
  assert.deepEqual(archiveById(records, "nope", "2026-08-31T09:00:00.000Z"), records);
  assert.deepEqual(archiveById(undefined, "a", "2026-08-31T09:00:00.000Z"), []);
});

test("a record already archived keeps its original stamp", () => {
  // Restoring reads the stamp to decide what was archived together with what.
  // Re-stamping an already-archived record would silently redraw that line.
  const records = [{ id: "a", archivedAt: "2026-08-01T00:00:00.000Z" }];
  const next = archiveById(records, "a", "2026-08-31T09:00:00.000Z");
  assert.equal(next[0].archivedAt, "2026-08-01T00:00:00.000Z");
});

test("stamping by predicate archives a whole set at one instant", () => {
  // A task and its comments are archived together and share a stamp, which is
  // what tells a restore which comments went down with the task.
  const comments = [
    { id: "c1", ticketId: "t1" },
    { id: "c2", ticketId: "t1" },
    { id: "c3", ticketId: "t2" },
  ];
  const next = archiveWhere(comments, (c) => c.ticketId === "t1", "2026-08-31T09:00:00.000Z");

  assert.equal(next[0].archivedAt, "2026-08-31T09:00:00.000Z");
  assert.equal(next[1].archivedAt, "2026-08-31T09:00:00.000Z");
  assert.equal(next[2].archivedAt, undefined);
});

test("stamping by predicate skips what is already archived", () => {
  const comments = [
    { id: "c1", ticketId: "t1", archivedAt: "2026-08-01T00:00:00.000Z" },
    { id: "c2", ticketId: "t1" },
  ];
  const next = archiveWhere(comments, (c) => c.ticketId === "t1", "2026-08-31T09:00:00.000Z");
  assert.equal(next[0].archivedAt, "2026-08-01T00:00:00.000Z");
  assert.equal(next[1].archivedAt, "2026-08-31T09:00:00.000Z");
});

test("a stamped record is hidden from the live list and found in the archive", () => {
  // The whole point: deleting moves a record between these two views without
  // it ever leaving the array the app is holding.
  const stamped = archiveById([{ id: "a" }, { id: "b" }], "b", "2026-08-31T09:00:00.000Z");
  assert.deepEqual(withoutArchived(stamped).map((r) => r.id), ["a"]);
  assert.deepEqual(onlyArchived(stamped).map((r) => r.id), ["b"]);
});

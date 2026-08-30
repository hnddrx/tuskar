import test from "node:test";
import assert from "node:assert/strict";

import { buildNotesSearch, filterNotes, parseNotesSearchParams } from "./noteList.js";
import { pagerFor } from "./recordPager.js";

function note(over) {
  return { id: over.id, type: "freeform", title: "Note", body: "", ...over };
}

test("the round trip through the URL leaves the view unchanged", () => {
  const state = { query: "standup", type: "mom" };
  assert.deepEqual(parseNotesSearchParams(new URLSearchParams(buildNotesSearch(state))), state);
});

test("an empty search and the all-types filter stay out of the URL", () => {
  assert.equal(buildNotesSearch({ query: "  ", type: "all" }), "");
  assert.deepEqual(parseNotesSearchParams(new URLSearchParams("")), { query: "", type: "all" });
});

test("filtering narrows by type and searches title and body", () => {
  const notes = [
    note({ id: "a", type: "mom", title: "Sprint kickoff" }),
    note({ id: "b", type: "freeform", title: "Ideas", body: "kickoff checklist" }),
    note({ id: "c", type: "freeform", title: "Groceries" }),
  ];

  assert.deepEqual(filterNotes(notes, { query: "", type: "mom" }).map((n) => n.id), ["a"]);
  assert.deepEqual(
    filterNotes(notes, { query: "kickoff", type: "all" }).map((n) => n.id),
    ["a", "b"]
  );
  assert.deepEqual(
    filterNotes(notes, { query: "kickoff", type: "freeform" }).map((n) => n.id),
    ["b"]
  );
});

test("a note with no body is searchable rather than a crash", () => {
  const notes = [note({ id: "a", title: "Untitled", body: undefined })];
  assert.deepEqual(filterNotes(notes, { query: "untitled", type: "all" }).map((n) => n.id), ["a"]);
});

test("filtering keeps the list's newest-first order for the pager", () => {
  const notes = [note({ id: "a" }), note({ id: "b", type: "mom" }), note({ id: "c" })];
  const ordered = filterNotes(notes, { query: "", type: "freeform" });

  const first = pagerFor(ordered, "a");
  assert.equal(first.index, 0);
  assert.equal(first.total, 2);
  assert.equal(first.prev, null);
  assert.equal(first.next.id, "c");

  assert.equal(pagerFor(ordered, "b"), null);
});

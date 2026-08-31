// The Notes list's view state and the ordering it produces.
//
// Mirrors @/lib/taskList: the record pager on a note has to reproduce the
// list it was opened from, so search-param parsing and filtering live here
// rather than inside the page, where the pager couldn't reach them.
//
// There is no sort key — notes arrive newest-first from the API and the list
// keeps that order, so filtering alone gives the sequence the pager walks.

import { applyArchiveFilter } from "./archive.js";

export const TYPE_ALL = "all";

export function parseNotesSearchParams(searchParams) {
  return {
    query: searchParams.get("q") || "",
    type: searchParams.get("type") || TYPE_ALL,
    // In the URL for the same reason as the task table's: the note pager
    // rebuilds this list from these params.
    showArchived: searchParams.get("archived") === "1",
  };
}

export function buildNotesSearch({ query, type, showArchived }) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query);
  if (type !== TYPE_ALL) params.set("type", type);
  if (showArchived) params.set("archived", "1");
  return params.toString();
}

export function filterNotes(notes, { query, type, showArchived }) {
  const q = query.trim().toLowerCase();
  return applyArchiveFilter(notes, showArchived).filter((n) => {
    if (type !== TYPE_ALL && n.type !== type) return false;
    if (!q) return true;
    return (
      (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q)
    );
  });
}

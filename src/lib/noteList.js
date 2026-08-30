// The Notes list's view state and the ordering it produces.
//
// Mirrors @/lib/taskList: the record pager on a note has to reproduce the
// list it was opened from, so search-param parsing and filtering live here
// rather than inside the page, where the pager couldn't reach them.
//
// There is no sort key — notes arrive newest-first from the API and the list
// keeps that order, so filtering alone gives the sequence the pager walks.

export const TYPE_ALL = "all";

export function parseNotesSearchParams(searchParams) {
  return {
    query: searchParams.get("q") || "",
    type: searchParams.get("type") || TYPE_ALL,
  };
}

export function buildNotesSearch({ query, type }) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query);
  if (type !== TYPE_ALL) params.set("type", type);
  return params.toString();
}

export function filterNotes(notes, { query, type }) {
  const q = query.trim().toLowerCase();
  return notes.filter((n) => {
    if (type !== TYPE_ALL && n.type !== type) return false;
    if (!q) return true;
    return (
      (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q)
    );
  });
}

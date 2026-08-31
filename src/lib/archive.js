// Soft deletion, app-wide.
//
// Deleting anything stamps `archivedAt` rather than removing the row. The
// ordinary lists hide what is stamped, the Archive page is where it can be
// found again, and only an explicit "delete permanently" from there ever
// destroys data.
//
// The record types are named once, here, because three separate places need
// to agree on them: the API route that restores and permanently deletes, the
// Archive page that groups what it finds, and the tests. A type that is in
// the UI but not in ARCHIVE_TYPES is a record you can archive and never get
// back, so the route validates against this list rather than trusting a path
// segment.

/**
 * @typedef {"task"|"comment"|"note"|"teamTask"|"teamComment"|"event"|"teamEvent"|"timeEntry"} ArchiveType
 */

// `table` and `scopeColumn` are what the archive route needs to find a row and
// prove it belongs to the caller. `label` and `plural` are what the Archive
// page shows. Order is the order the Archive page renders its groups in.
export const ARCHIVE_TYPES = {
  task: { table: "tasks", scope: "user", label: "Task", plural: "Tasks" },
  teamTask: { table: "team_tasks", scope: "org", label: "Team task", plural: "Team tasks" },
  note: { table: "notes", scope: "user", label: "Note", plural: "Notes" },
  comment: { table: "comments", scope: "user", label: "Comment", plural: "Comments" },
  teamComment: {
    table: "team_comments",
    scope: "org",
    label: "Team comment",
    plural: "Team comments",
  },
  event: { table: "calendar_events", scope: "user", label: "Event", plural: "Calendar events" },
  teamEvent: {
    table: "team_calendar_events",
    scope: "org",
    label: "Team event",
    plural: "Team calendar events",
  },
  timeEntry: {
    table: "time_entries",
    scope: "user",
    label: "Time entry",
    plural: "Time entries",
  },
};

/** The types in the order the Archive page groups them. */
export const ARCHIVE_TYPE_KEYS = Object.keys(ARCHIVE_TYPES);

/**
 * A path segment is only a record type if it is one of ours — never a table
 * name to interpolate into SQL on the strength of what the client sent.
 */
export function archiveTypeOf(type) {
  return Object.prototype.hasOwnProperty.call(ARCHIVE_TYPES, type)
    ? ARCHIVE_TYPES[type]
    : null;
}

/** Has this record been archived? */
export function isArchived(record) {
  return Boolean(record?.archivedAt);
}

/**
 * The live records — what every list shows unless it is deliberately showing
 * the archive too.
 */
export function withoutArchived(records = []) {
  return records.filter((r) => !isArchived(r));
}

/** Only the archived records, newest archived first. */
export function onlyArchived(records = []) {
  return records
    .filter(isArchived)
    .sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
}

/**
 * What a list should show for a given "Show archived" setting.
 *
 * Showing the archive means showing it *alongside* the live records rather
 * than instead of them: the point of the in-list toggle is to see an archived
 * row back in its context, next to the ones that are still current.
 */
export function applyArchiveFilter(records = [], showArchived = false) {
  return showArchived ? records : withoutArchived(records);
}

/**
 * The list as it stands the instant something is deleted.
 *
 * Deleting used to drop the record from the array the app was holding, which
 * meant the record was gone from the Archive too — the Archive is derived
 * from that same array — until a reload fetched it back with its stamp. So
 * the client stamps the record exactly as the server does, and it moves from
 * the live list to the archive without ever leaving the array.
 *
 * A record that is already archived keeps its original stamp. Restoring a
 * task brings back the comments stamped at the same instant, so re-stamping
 * one would quietly move it into a set it was never part of.
 *
 * Records that do not match are returned by identity, not copied: these lists
 * feed memoised selectors across the app, and rebuilding every object would
 * invalidate them for records that did not change.
 */
export function archiveWhere(records = [], predicate, archivedAt) {
  return (records || []).map((r) =>
    !isArchived(r) && predicate(r) ? { ...r, archivedAt } : r
  );
}

/** `archiveWhere` for the common case of one record, by id. */
export function archiveById(records = [], id, archivedAt) {
  return archiveWhere(records, (r) => r.id === id, archivedAt);
}

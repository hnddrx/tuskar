// Time-tracking arithmetic and formatting.
//
// A running entry has no `endedAt`, so its elapsed time is only knowable
// against a "now" — which every function here takes as an argument rather
// than reading the clock itself, so the results are deterministic and
// testable, and so a re-render can tick the display without the data
// changing underneath it.

const MINUTE = 60;
const HOUR = 60 * MINUTE;

/**
 * When something happened, in full: "31 Aug 2026, 09:54".
 *
 * Every record carries a creation stamp to the millisecond, but the task
 * tables used to render `createdAt.slice(0, 10)` and throw the time away, and
 * three pages each kept a private near-identical formatter that could drift.
 * This is the one of them, so a timestamp reads the same wherever it appears.
 *
 * Locale-aware rather than fixed: the viewer's own ordering and 12- or 24-hour
 * clock is what they can read at a glance. The year is always shown — a
 * stamp that hides it is ambiguous the moment a record is a year old.
 *
 * Anything unparseable returns "—" rather than "Invalid Date": a malformed
 * stamp is a gap in the data, and should look like one.
 */
export function formatDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The date alone, for where a time would be noise — a day heading, say. */
export function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "45s", "12m", "1h 23m", "2h" — and "—" for nothing worth showing. */
export function formatDuration(seconds) {
  const total = Math.floor(Number(seconds));
  if (!Number.isFinite(total) || total <= 0) return "—";

  if (total < MINUTE) return `${total}s`;
  if (total < HOUR) return `${Math.floor(total / MINUTE)}m`;

  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function isRunning(entry) {
  return Boolean(entry) && !entry.endedAt;
}

function secondsBetween(from, to) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  // A clock skew between devices could otherwise show a negative timer.
  return Math.max(0, Math.floor((end - start) / 1000));
}

export function entrySeconds(entry, now) {
  if (!entry) return 0;
  if (isRunning(entry)) return secondsBetween(entry.startedAt, now);
  // Explicitly not `Number.isFinite(Number(x))` — Number(null) is 0, which
  // would report a missing duration as zero seconds.
  if (entry.durationSeconds !== null && entry.durationSeconds !== undefined) {
    return Math.max(0, Math.floor(Number(entry.durationSeconds)));
  }
  // A stored duration is authoritative, but an entry that somehow lacks one
  // can still be measured from its own timestamps.
  return secondsBetween(entry.startedAt, entry.endedAt);
}

export function totalSeconds(entries, now) {
  return (entries || []).reduce((sum, e) => sum + entrySeconds(e, now), 0);
}

export function totalForTask(entries, taskId, now) {
  return totalSeconds(
    (entries || []).filter((e) => e.taskId === taskId),
    now
  );
}

/**
 * Buckets entries by the calendar day they started, newest day first, each
 * with its own total. Used by the time log.
 */
export function groupByDay(entries, now) {
  const byDate = new Map();
  for (const entry of entries || []) {
    const date = String(entry.startedAt || "").slice(0, 10);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(entry);
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, dayEntries]) => ({
      date,
      entries: dayEntries,
      seconds: totalSeconds(dayEntries, now),
    }));
}

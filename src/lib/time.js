// Time-tracking arithmetic and formatting.
//
// A running entry has no `endedAt`, so its elapsed time is only knowable
// against a "now" — which every function here takes as an argument rather
// than reading the clock itself, so the results are deterministic and
// testable, and so a re-render can tick the display without the data
// changing underneath it.

const MINUTE = 60;
const HOUR = 60 * MINUTE;

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

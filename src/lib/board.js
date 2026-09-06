// Laying tasks out on a board, and deciding what a drop means.
//
// Both boards — My Board and the Team Board — draw the same thing from
// different data, so the grouping and the drop rules live here rather than
// twice in two pages that then drift apart.

/** Where a task with no status at all is filed. */
export const NO_STATUS = "No status";

function statusOf(task) {
  const raw = task?.status;
  return typeof raw === "string" && raw.trim() !== "" ? raw : NO_STATUS;
}

function uniqueStatuses(statuses) {
  const seen = new Set();
  const out = [];
  for (const s of statuses || []) {
    if (typeof s !== "string" || s.trim() === "" || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * The columns a board draws, in order: the team's configured statuses first,
 * then one trailing column for every status the tasks actually carry that the
 * configuration no longer lists.
 *
 * Those trailing columns are the point. Filtering tasks down to the configured
 * statuses — which is what the boards used to do — silently hid any task whose
 * status had since been renamed or removed from the configuration, or that
 * arrived from Jira with a status of its own. The card simply was not on the
 * board and nothing said so. Showing it in a column of its own keeps it
 * findable, and lets it be dragged back onto a real column.
 *
 * They are marked `configured: false` so the board can render them as the
 * strays they are and refuse drops into them: dropping a card into a status
 * the team does not have would only create another one.
 */
export function boardColumns(statuses = [], tasks = []) {
  const configured = uniqueStatuses(statuses);
  const buckets = new Map(configured.map((s) => [s, []]));
  const strays = [];

  for (const task of tasks || []) {
    const status = statusOf(task);
    if (!buckets.has(status)) {
      buckets.set(status, []);
      strays.push(status);
    }
    buckets.get(status).push(task);
  }

  return [
    ...configured.map((status) => ({ status, configured: true, tasks: buckets.get(status) })),
    ...strays.map((status) => ({ status, configured: false, tasks: buckets.get(status) })),
  ];
}

/**
 * What a drop should write, or `null` when it should write nothing.
 *
 * Three drops change nothing and must not reach the server: one with no card
 * in hand, one holding a card that has since gone (a drag left dangling by a
 * cancelled drag used to move whichever card was picked up last), and one back
 * into the column the card came from — which would otherwise bump the task's
 * "last update" for having moved nowhere.
 */
export function dropUpdate(tasks = [], dragId, status) {
  if (!dragId || !status) return null;
  const task = (tasks || []).find((t) => t?.id === dragId);
  if (!task) return null;
  if (statusOf(task) === status) return null;
  return { id: task.id, patch: { status } };
}

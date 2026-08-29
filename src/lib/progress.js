// Derives a task's completion percentage instead of trusting a hand-typed
// number. Progress is computed at read time everywhere it's displayed — the
// stored `progress` column is only consulted for tasks that opted out of
// automatic calculation (see `progressAuto`), so what you see can never drift
// from the task's real status or its subtasks.

// Seeded into a new account's board config; users can retune these per status
// on the Configuration page. A status missing from the map means "don't guess"
// — those tasks fall back to their stored value.
export const DEFAULT_STATUS_PROGRESS = {
  "Not Started": 0,
  "To Do": 0,
  "In Progress": 50,
  Blocked: 25,
  "For Testing": 75,
  "For Demo": 85,
  "For Deployment": 95,
  Done: 100,
  Completed: 100,
  Cancelled: 0,
};

// Cancelled subtasks are dropped from a parent's average rather than counted
// as incomplete: work that was called off shouldn't hold its parent below
// 100% forever.
const EXCLUDED_FROM_ROLLUP = ["Cancelled"];

function clamp(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

/**
 * @param task       the task to compute a percentage for
 * @param allTasks   every task in the same scope (personal or team)
 * @param statusMap  status name -> percent, from board config
 * @param seen       internal — guards against a malformed parent cycle
 */
export function computeProgress(task, allTasks, statusMap = {}, seen = new Set()) {
  if (!task) return 0;
  if (seen.has(task.id)) return 0;

  if (task.progressAuto === false) return clamp(task.progress);

  const nextSeen = new Set(seen).add(task.id);
  const children = allTasks.filter(
    (t) => t.parentId === task.id && !EXCLUDED_FROM_ROLLUP.includes(t.status)
  );

  if (children.length > 0) {
    const total = children.reduce(
      (sum, child) => sum + computeProgress(child, allTasks, statusMap, nextSeen),
      0
    );
    return clamp(total / children.length);
  }

  const mapped = statusMap?.[task.status];
  return clamp(mapped === undefined || mapped === null ? task.progress : mapped);
}

/**
 * Returns a copy of `tasks` with `progress` replaced by its computed value,
 * so tables, boards, sorting, and exports all agree without each one
 * re-deriving it.
 */
export function withComputedProgress(tasks, statusMap) {
  return tasks.map((t) => ({ ...t, progress: computeProgress(t, tasks, statusMap) }));
}

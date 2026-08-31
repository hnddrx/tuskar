// Counting team work, for the Overview.
//
// The team payload has always carried every team the person is in, but the
// Overview showed its team section only when one was selected in the switcher,
// and labelled the totals with that team's name — so the numbers were across
// all teams while the heading claimed they were one team's. Switching to a
// personal account hid the section altogether, even for someone in five teams.
//
// Summarising lives here rather than in the page so the total and the per-team
// rows are computed the same way, by the same function. A breakdown that did
// not add up to the total it sits under would be worse than no breakdown.

import { DONE_STATUSES } from "./constants.js";

const HIGH_PRIORITIES = ["Critical", "Highest", "High"];

/** A task still to do — the status list is shared with the rest of the app. */
export function isOpenTask(task) {
  return !DONE_STATUSES.includes(task?.status);
}

/**
 * One set of numbers for one list of tasks.
 *
 * Everything but `total` and `done` counts open tasks only: a high-priority
 * task that is finished is not work outstanding, and an overdue one that is
 * done is not overdue — it landed late, which is a different question.
 *
 * `today` is passed in rather than read from the clock so the same tasks
 * always give the same answer.
 */
export function summariseTasks(tasks = [], { userId = null, today = new Date() } = {}) {
  const open = tasks.filter(isOpenTask);
  return {
    total: tasks.length,
    open: open.length,
    done: tasks.length - open.length,
    assignedToMe: open.filter((t) => (t.assigneeIds || []).includes(userId)).length,
    highPriority: open.filter((t) => HIGH_PRIORITIES.includes(t.priority)).length,
    overdue: open.filter((t) => t.targetDate && new Date(t.targetDate) < today).length,
  };
}

/**
 * The same numbers per team, in the order the teams are given — which is the
 * order the sidebar lists them, so the two read alike.
 *
 * A team with nothing in it still gets a row. Its absence would read as "you
 * are not in that team" rather than "there is nothing in it yet".
 */
export function summariseByTeam(tasks = [], orgs = [], options = {}) {
  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    ...summariseTasks(
      tasks.filter((t) => t.orgId === org.id),
      options
    ),
  }));
}

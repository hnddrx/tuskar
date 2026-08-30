"use client";

import { useMemo } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTasks } from "@/context/TaskContext";
import { useNow } from "@/lib/useNow";
import { totalForTask } from "@/lib/time";
import { TEAM_PARAM, resolveTeamScope, tasksForTeam } from "@/lib/teamScope";
import { commentsByTaskId, orderTasks, parseTasksSearchParams } from "@/lib/taskList";
import { pagerFor } from "@/lib/recordPager";

// Odoo's record pager: a task opened from a list knows its place in that list
// and can step to the neighbours without going back first.
//
// The list isn't carried along in the URL — only the `from` link back to it
// is, and that link already encodes the whole view (search, filters, sort).
// So the pager re-derives the list from the same data and the same ordering
// the table used. Anything that changes the table changes the pager with it.

function assigneeNames(t) {
  return t.assignees?.length ? t.assignees.map((a) => a.name) : [];
}

/**
 * @param {string} from      the `?from=` link back to the originating list
 * @param {string} fromLabel its breadcrumb label, carried on to the neighbours
 * @param {string} taskId    the task on screen
 * @return {{index: number, total: number, prevHref: string|null, nextHref: string|null} | null}
 *         null when this task wasn't opened from a task list, or is no longer
 *         part of one — a bookmarked URL, a task reached from the board, or a
 *         record that has since dropped out of the filters.
 */
export function useTaskPager(from, fromLabel, taskId) {
  const {
    personal: { tasks: personalTasks, comments: personalComments, notes },
    team: { tasks: teamTasks, comments: teamComments, orgs },
    time: { entries: timeEntries },
  } = useTasks();
  const { userId } = useAuth();
  // Same coarse tick as the tables: a sort on tracked time stays in step
  // without re-rendering every second.
  const timeNow = useNow(60000);

  const origin = useMemo(() => {
    try {
      const url = new URL(from, "http://placeholder");
      return { pathname: url.pathname, params: url.searchParams };
    } catch {
      return null;
    }
  }, [from]);

  const isPersonalList = origin?.pathname === "/tasks";
  const isTeamList = origin?.pathname === "/team/tasks";

  // The personal table shows my own tasks alongside the team tasks assigned
  // to me, so the pager has to walk that same combined list.
  const personalRows = useMemo(() => {
    if (!isPersonalList) return [];
    const noteCounts = new Map();
    for (const note of notes) {
      if (!note.linkedTaskId) continue;
      noteCounts.set(note.linkedTaskId, (noteCounts.get(note.linkedTaskId) || 0) + 1);
    }
    return [
      ...personalTasks.map((t) => ({ ...t, scope: "personal" })),
      ...(teamTasks || [])
        .filter((t) => (t.assigneeIds || []).includes(userId))
        .map((t) => ({
          ...t,
          scope: "team",
          assignee: (t.assignees || []).map((a) => a.name).join(", ") || "Unassigned",
        })),
    ].map((t) => ({
      ...t,
      noteCount: noteCounts.get(t.id) || 0,
      trackedSeconds: totalForTask(timeEntries, t.id, timeNow),
    }));
  }, [isPersonalList, personalTasks, teamTasks, notes, timeEntries, timeNow, userId]);

  const teamRows = useMemo(() => {
    if (!isTeamList) return [];
    const scope = resolveTeamScope(origin.params.get(TEAM_PARAM), orgs);
    return tasksForTeam(teamTasks, scope).map((t) => ({
      ...t,
      scope: "team",
      trackedSeconds: totalForTask(timeEntries, t.id, timeNow),
    }));
  }, [isTeamList, origin, orgs, teamTasks, timeEntries, timeNow]);

  const ordered = useMemo(() => {
    if (!isPersonalList && !isTeamList) return null;
    const state = parseTasksSearchParams(origin.params);
    const rows = isPersonalList ? personalRows : teamRows;
    const comments = isPersonalList ? personalComments : teamComments;
    return orderTasks(rows, state, commentsByTaskId(comments), {
      assigneeNames: isTeamList ? assigneeNames : undefined,
    });
  }, [isPersonalList, isTeamList, origin, personalRows, teamRows, personalComments, teamComments]);

  return useMemo(() => {
    if (!ordered) return null;
    const pager = pagerFor(ordered, taskId);
    if (!pager) return null;

    // Neighbours keep the same `from`, so paging never loses the trail back
    // to the list — or the pager itself.
    const hrefFor = (task) => {
      if (!task) return null;
      const base = task.scope === "team" ? "/team/tasks" : "/tasks";
      const params = new URLSearchParams({ from, fromLabel });
      return `${base}/${task.id}?${params.toString()}`;
    };

    return {
      index: pager.index,
      total: pager.total,
      prevHref: hrefFor(pager.prev),
      nextHref: hrefFor(pager.next),
    };
  }, [ordered, taskId, from, fromLabel]);
}

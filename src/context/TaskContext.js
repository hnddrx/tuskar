"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useAuth, useUser, useOrganization } from "@clerk/nextjs";
import seed from "@/data/seed.json";
import { newId, nowIso, todayIso } from "@/lib/id";
import { STORAGE_KEY } from "@/lib/constants";
import { withComputedProgress, DEFAULT_STATUS_PROGRESS } from "@/lib/progress";
import { archiveById, archiveWhere, onlyArchived, withoutArchived } from "@/lib/archive";
import { hasPermission } from "@/lib/permissions";
import { useConfirm } from "@/components/ConfirmProvider";

const TaskContext = createContext(null);
const IMPORT_OFFERED_KEY = "taskar:import-offered:v1";
const EMPTY_TEAM_CONFIG = { statuses: [], priorities: [], types: [], assignees: [] };
const SEED_CONFIG = { ...seed.config, statusProgress: DEFAULT_STATUS_PROGRESS };

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load state (${res.status})`);
  return res.json();
}

async function fetchMembers() {
  const res = await fetch("/api/team/members");
  if (!res.ok) throw new Error(`Failed to load team members (${res.status})`);
  return res.json();
}

function readLegacyLocalState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) return null;
    return {
      tasks: parsed.tasks,
      comments: parsed.comments || [],
      config: {
        statuses: parsed.config?.statuses || seed.config.statuses,
        priorities: parsed.config?.priorities || seed.config.priorities,
        types: parsed.config?.types || seed.config.types,
        assignees: parsed.config?.assignees || seed.config.assignees,
      },
    };
  } catch {
    return null;
  }
}

// Filters a set of member-id assignments down to ids that actually resolve
// against the team's current membership. An id that doesn't resolve (e.g.
// `members` hasn't loaded yet, or the person left the team) is dropped
// rather than stored — assigneeIds and the resolved `assignees` shown in the
// UI must never disagree about who's actually assigned.
function resolveAssigneeIds(ids, members) {
  const validIds = new Set(members.map((m) => m.id));
  return (ids || []).filter((id) => validIds.has(id));
}

function resolveAssignees(ids, members) {
  const byId = new Map(members.map((m) => [m.id, m.name]));
  return ids.map((id) => ({ id, name: byId.get(id) || "Unknown" }));
}

export function TaskProvider({ children }) {
  const { isLoaded, isSignedIn, userId, orgId } = useAuth();
  const { user } = useUser();
  const { organization } = useOrganization();
  const orgName = organization?.name || null;
  const confirm = useConfirm();

  const [personal, setPersonal] = useState({
    tasks: seed.tasks,
    comments: seed.comments,
    notes: [],
    config: SEED_CONFIG,
  });
  const [personalHydrated, setPersonalHydrated] = useState(false);
  const [personalEvents, setPersonalEvents] = useState([]);
  // Time entries belong to the signed-in person and span both boards, so they
  // sit outside the personal/team split rather than inside either one.
  const [timeEntries, setTimeEntries] = useState([]);
  const lastUserIdRef = useRef(undefined);

  const [team, setTeam] = useState({
    tasks: [],
    comments: [],
    configs: {},
    defaults: EMPTY_TEAM_CONFIG,
    orgs: [],
    // What this person may do, per team. Used only to decide which controls to
    // draw — the API enforces the same rules regardless of what is sent.
    permissions: {},
    // Which teams they administer. Separate from permissions because it is a
    // Clerk role, and it is what decides who can hand permissions out.
    admins: {},
  });
  // Pulled out so callbacks can depend on the team list alone rather than on
  // every task edit. Preserved by reference across the other setTeam calls.
  const teamOrgs = team.orgs;
  const [teamEvents, setTeamEvents] = useState([]);
  const [members, setMembers] = useState([]);

  // "The team you are working in" — the switcher's team, drawn from the same
  // per-team map the scoped pages read, so selecting a team costs no fetch.
  // Assignee names come from the member list rather than being stored.
  const activeTeamConfig = useMemo(
    () => ({
      ...((orgId && team.configs?.[orgId]) || team.defaults || EMPTY_TEAM_CONFIG),
      assignees: members.map((m) => m.name),
    }),
    [orgId, team.configs, team.defaults, members],
  );
  const [teamHydrated, setTeamHydrated] = useState(false);

  const [syncError, setSyncError] = useState(null);
  const failedRequestRef = useRef(null);

  const syncCall = useCallback((requestFn) => {
    requestFn()
      .then(() => {
        setSyncError(null);
        failedRequestRef.current = null;
      })
      .catch((err) => {
        console.warn("Taskar sync failed", err);
        setSyncError(err.message || "Sync failed");
        failedRequestRef.current = requestFn;
      });
  }, []);

  const retrySync = useCallback(() => {
    if (failedRequestRef.current) syncCall(failedRequestRef.current);
  }, [syncCall]);

  const dismissSyncError = useCallback(() => setSyncError(null), []);

  // Everyone you share any team with. A standalone stable callback (not
  // inlined below) so it can double as the retryable request handed to
  // `syncCall` on failure.
  const loadMembers = useCallback(async () => {
    const list = await fetchMembers();
    setMembers(list);
    return list;
  }, []);

  // Personal state loads once per signed-in user and is completely
  // independent of the active Clerk organization — switching teams never
  // touches it. Re-runs (resetting first) only when the signed-in user
  // changes.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    const userChanged = lastUserIdRef.current !== undefined && lastUserIdRef.current !== userId;
    if (userChanged) {
      setPersonalHydrated(false);
      setPersonal({ tasks: [], comments: [], notes: [], config: SEED_CONFIG });
      setPersonalEvents([]);
      setTimeEntries([]);
    }
    lastUserIdRef.current = userId;

    (async () => {
      try {
        let server = await fetchJson("/api/state");

        const alreadyOffered = window.localStorage.getItem(IMPORT_OFFERED_KEY);
        const legacy = alreadyOffered ? null : readLegacyLocalState();
        if (!server.hasSynced && legacy && legacy.tasks.length > 0) {
          const wantsImport = await confirm({
            title: "Import existing tasks?",
            message:
              "This device has tasks saved locally from before cloud sync. Import them into your account now?",
            confirmLabel: "Import",
            cancelLabel: "Skip",
          });
          window.localStorage.setItem(IMPORT_OFFERED_KEY, "1");
          if (wantsImport) {
            const res = await fetch("/api/state/import", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(legacy),
            });
            if (res.ok) server = await fetchJson("/api/state");
          }
        } else if (!alreadyOffered) {
          window.localStorage.setItem(IMPORT_OFFERED_KEY, "1");
        }

        // Calendar events live on their own route, so a failure there can't
        // take the tasks/comments load down with it.
        const events = await fetchJson("/api/calendar/events").catch((err) => {
          console.warn("Failed to load personal calendar events", err);
          return [];
        });
        const entries = await fetchJson("/api/time/entries").catch((err) => {
          console.warn("Failed to load time entries", err);
          return [];
        });

        if (cancelled) return;
        setPersonal({
          tasks: server.tasks,
          comments: server.comments,
          notes: server.notes || [],
          config: server.config,
        });
        setPersonalEvents(events);
        setTimeEntries(entries);
      } catch (err) {
        console.warn("Failed to load personal taskar state from server", err);
      } finally {
        if (!cancelled) setPersonalHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, confirm]);

  // Team state loads whenever there's an active org, reloads on switching to
  // a different team, and clears to empty when there's no active team
  // (Personal Account selected) — independent of the personal effect above,
  // so both can be loaded at once.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    // Everything team-scoped — tasks, comments, members and every team's
    // columns — is loaded for all the teams you are in, so moving the
    // switcher changes nothing about what has to be fetched. Deliberately not
    // keyed on the active team: reloading here blanked the page mid-switch.
    (async () => {
      try {
        const server = await fetchJson("/api/team/state");
        let memberList = [];
        try {
          memberList = await loadMembers();
        } catch (err) {
          console.warn("Failed to load team members", err);
          if (!cancelled) syncCall(loadMembers);
        }
        const events = await fetchJson("/api/team/calendar/events").catch((err) => {
          console.warn("Failed to load team calendar events", err);
          return [];
        });

        if (cancelled) return;
        setTeam({
          tasks: server.tasks,
          comments: server.comments,
          configs: server.configs || {},
          defaults: server.defaults || EMPTY_TEAM_CONFIG,
          orgs: server.orgs || [],
          permissions: server.permissions || {},
          admins: server.admins || {},
        });
        setTeamEvents(events);
      } catch (err) {
        console.warn("Failed to load team taskar state from server", err);
      } finally {
        if (!cancelled) setTeamHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, syncCall, loadMembers]);

  // ---------------------------------------------------------------------
  // Personal mutators
  // ---------------------------------------------------------------------

  const addTask = useCallback((task) => {
    const id = newId("task");
    const ts = nowIso();
    const record = {
      id,
      ticketId: task.ticketId?.trim() || "N/A",
      parentId: task.parentId || null,
      type: task.type || "Task",
      name: task.name?.trim() || "Untitled task",
      status: task.status || "Not Started",
      priority: task.priority || "Normal",
      assignee: task.assignee || "Unassigned",
      startDate: task.startDate || null,
      targetDate: task.targetDate || null,
      progress: Number(task.progress) || 0,
      progressAuto: task.progressAuto !== false,
      lastUpdate: todayIso(),
      description: task.description || "",
      githubBranch: task.githubBranch || "N/A",
      jiraLink: task.jiraLink || null,
      commentCount: 0,
      syncSource: task.syncSource || "Manual",
      createdAt: ts,
      updatedAt: ts,
    };
    setPersonal((s) => ({ ...s, tasks: [...s.tasks, record] }));
    syncCall(() =>
      fetch("/api/state/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save task");
      })
    );
    return id;
  }, [syncCall]);

  const updateTask = useCallback((id, patch) => {
    const fullPatch = { ...patch, lastUpdate: todayIso(), updatedAt: nowIso() };
    setPersonal((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fullPatch } : t)),
    }));
    syncCall(() =>
      fetch(`/api/state/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update task");
      })
    );
  }, [syncCall]);

  // Stamps rather than removes. The Archive page is derived from these same
  // arrays, so dropping the record here would delete it out of the archive as
  // well — it would only reappear once a reload fetched it back with its
  // stamp. The task and its comments share one stamp, as the route writes
  // them, so restoring the task brings back exactly that thread.
  //
  // Subtasks keep their parentId: the route keeps parent_id too, because
  // archiving is reversible and orphaning them would lose the tree.
  const deleteTask = useCallback((id) => {
    const archivedAt = nowIso();
    setPersonal((s) => ({
      ...s,
      tasks: archiveById(s.tasks, id, archivedAt),
      comments: archiveWhere(s.comments, (c) => c.ticketId === id, archivedAt),
    }));
    syncCall(() =>
      fetch(`/api/state/tasks/${id}`, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete task");
      })
    );
  }, [syncCall]);

  const addComment = useCallback((taskId, { author, text, parentCommentId = null, jiraIssueLink = null, syncSource = "Manual" }) => {
    const id = newId("comment");
    const ts = nowIso();
    const record = {
      id,
      ticketId: taskId,
      parentCommentId,
      created: ts,
      updated: ts,
      author: author || "Me",
      text: text || "",
      jiraIssueLink,
      syncSource,
    };
    setPersonal((s) => ({
      ...s,
      comments: [...s.comments, record],
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, commentCount: (t.commentCount || 0) + 1 } : t
      ),
    }));
    syncCall(() =>
      fetch("/api/state/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save comment");
      })
    );
    return id;
  }, [syncCall]);

  const deleteComment = useCallback((commentId, taskId) => {
    const archivedAt = nowIso();
    setPersonal((s) => ({
      ...s,
      // Archived, not dropped; the count still falls, because it reports the
      // comments on the task now and an archived one is not one of them.
      comments: archiveById(s.comments, commentId, archivedAt),
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, commentCount: Math.max(0, (t.commentCount || 0) - 1) }
          : t
      ),
    }));
    syncCall(() =>
      fetch(`/api/state/comments/${commentId}?taskId=${encodeURIComponent(taskId)}`, {
        method: "DELETE",
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete comment");
      })
    );
  }, [syncCall]);

  const updateConfig = useCallback((key, values) => {
    setPersonal((s) => ({ ...s, config: { ...s.config, [key]: values } }));
    syncCall(() =>
      fetch("/api/state/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, values }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update config");
      })
    );
  }, [syncCall]);

  // Merge Jira-sourced issues (one-way pull). Matches by ticketId; creates new
  // tasks for issues we haven't seen, updates Jira-owned fields on existing
  // ones, and never touches tasks whose syncSource is "Manual". Reads
  // `personal.tasks` directly (not via a setState updater) so the same
  // records used to update local state are the ones sent to the API.
  const mergeJiraIssues = useCallback((issues) => {
    const byTicket = new Map(personal.tasks.map((t) => [t.ticketId, t]));
    const toCreate = [];
    const toUpdate = [];
    const ts = nowIso();

    for (const issue of issues) {
      const existing = byTicket.get(issue.ticketId);
      if (existing) {
        toUpdate.push({
          ...existing,
          name: issue.name,
          status: issue.status,
          priority: issue.priority || existing.priority,
          assignee: issue.assignee || existing.assignee,
          targetDate: issue.targetDate ?? existing.targetDate,
          startDate: issue.startDate ?? existing.startDate,
          description: issue.description ?? existing.description,
          jiraLink: issue.jiraLink,
          syncSource: "Jira",
          lastUpdate: todayIso(),
          updatedAt: ts,
        });
      } else {
        toCreate.push({
          id: newId("task"),
          ticketId: issue.ticketId,
          parentId: null,
          type: issue.type || "Task",
          name: issue.name,
          status: issue.status,
          priority: issue.priority || "Normal",
          assignee: issue.assignee || "Unassigned",
          startDate: issue.startDate || null,
          targetDate: issue.targetDate || null,
          progress: 0,
          // Jira owns this issue's progress; the status/subtask rule must not
          // overwrite what the sync brought in.
          progressAuto: false,
          lastUpdate: todayIso(),
          description: issue.description || "",
          githubBranch: "N/A",
          jiraLink: issue.jiraLink,
          commentCount: 0,
          syncSource: "Jira",
          createdAt: ts,
          updatedAt: ts,
        });
      }
    }

    const updateById = new Map(toUpdate.map((t) => [t.id, t]));
    const nextTasks = [
      ...personal.tasks.map((t) => updateById.get(t.id) || t),
      ...toCreate,
    ];
    setPersonal((s) => ({ ...s, tasks: nextTasks }));

    for (const task of toCreate) {
      syncCall(() =>
        fetch("/api/state/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        }).then((res) => {
          if (!res.ok) throw new Error("Failed to save imported task");
        })
      );
    }
    for (const task of toUpdate) {
      syncCall(() =>
        fetch(`/api/state/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        }).then((res) => {
          if (!res.ok) throw new Error("Failed to save imported task");
        })
      );
    }

    return { created: toCreate.length, updated: toUpdate.length };
  }, [personal.tasks, syncCall]);

  const resetToSeed = useCallback(() => {
    // Reset clears tasks, comments, and config only — notes are untouched
    // server-side, so they must survive here too.
    setPersonal((s) => ({
      ...s,
      tasks: seed.tasks,
      comments: seed.comments,
      config: SEED_CONFIG,
    }));
    syncCall(() =>
      fetch("/api/state/reset", { method: "POST" }).then((res) => {
        if (!res.ok) throw new Error("Failed to reset data");
      })
    );
  }, [syncCall]);

  // Calendar events. Personal and team differ only in which route they hit,
  // so one factory builds both pairs of mutators.
  const makeEventMutators = (basePath, setEvents) => ({
    add: (event) => {
      const id = newId("event");
      const ts = nowIso();
      const record = {
        id,
        title: event.title?.trim() || "Untitled event",
        description: event.description || "",
        location: event.location || "",
        eventDate: event.eventDate,
        startTime: event.startTime || null,
        endTime: event.endTime || null,
        attendees: event.attendees || [],
        createdAt: ts,
        updatedAt: ts,
      };
      setEvents((list) => [...list, record]);
      syncCall(() =>
        fetch(basePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        }).then((res) => {
          if (!res.ok) throw new Error("Failed to save event");
        })
      );
      return record;
    },
    remove: (id) => {
      const archivedAt = nowIso();
      setEvents((list) => archiveById(list, id, archivedAt));
      syncCall(() =>
        fetch(`${basePath}/${id}`, { method: "DELETE" }).then((res) => {
          if (!res.ok) throw new Error("Failed to delete event");
        })
      );
    },
  });

  const addPersonalEvent = useCallback(
    (event) => makeEventMutators("/api/calendar/events", setPersonalEvents).add(event),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncCall]
  );
  const deletePersonalEvent = useCallback(
    (id) => makeEventMutators("/api/calendar/events", setPersonalEvents).remove(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncCall]
  );
  const addTeamEvent = useCallback(
    (event) => makeEventMutators("/api/team/calendar/events", setTeamEvents).add(event),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncCall]
  );
  const deleteTeamEvent = useCallback(
    (id) => makeEventMutators("/api/team/calendar/events", setTeamEvents).remove(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncCall]
  );

  // ---------------------------------------------------------------------
  // Team mutators
  // ---------------------------------------------------------------------

  const addTeamTask = useCallback((task) => {
    const id = newId("task");
    const ts = nowIso();
    const assigneeIds = resolveAssigneeIds(task.assigneeIds, members);
    const targetOrgId = task.orgId || orgId;
    const record = {
      id,
      orgId: targetOrgId,
      orgName: teamOrgs.find((o) => o.id === targetOrgId)?.name || orgName || null,
      ticketId: task.ticketId?.trim() || "N/A",
      parentId: task.parentId || null,
      type: task.type || "Task",
      name: task.name?.trim() || "Untitled task",
      status: task.status || "Not Started",
      priority: task.priority || "Normal",
      assigneeIds,
      assignees: resolveAssignees(assigneeIds, members),
      startDate: task.startDate || null,
      targetDate: task.targetDate || null,
      progress: Number(task.progress) || 0,
      progressAuto: task.progressAuto !== false,
      lastUpdate: todayIso(),
      description: task.description || "",
      githubBranch: task.githubBranch || "N/A",
      jiraLink: task.jiraLink || null,
      commentCount: 0,
      syncSource: task.syncSource || "Manual",
      createdAt: ts,
      updatedAt: ts,
    };
    setTeam((s) => ({ ...s, tasks: [...s.tasks, record] }));
    syncCall(() =>
      fetch("/api/team/state/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save task");
      })
    );
    return id;
  }, [syncCall, members, orgId, orgName, teamOrgs]);

  const updateTeamTask = useCallback((id, patch) => {
    const resolvedPatch = { ...patch };
    if ("assigneeIds" in patch) {
      const assigneeIds = resolveAssigneeIds(patch.assigneeIds, members);
      resolvedPatch.assigneeIds = assigneeIds;
      resolvedPatch.assignees = resolveAssignees(assigneeIds, members);
    }
    const fullPatch = { ...resolvedPatch, lastUpdate: todayIso(), updatedAt: nowIso() };
    setTeam((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fullPatch } : t)),
    }));
    syncCall(() =>
      fetch(`/api/team/state/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update task");
      })
    );
  }, [syncCall, members]);

  // Stamped rather than removed, for the same reason deleteTask is.
  const deleteTeamTask = useCallback((id) => {
    const archivedAt = nowIso();
    setTeam((s) => ({
      ...s,
      tasks: archiveById(s.tasks, id, archivedAt),
      comments: archiveWhere(s.comments, (c) => c.ticketId === id, archivedAt),
    }));
    syncCall(() =>
      fetch(`/api/team/state/tasks/${id}`, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete task");
      })
    );
  }, [syncCall]);

  const addTeamComment = useCallback((taskId, { text, parentCommentId = null, jiraIssueLink = null, syncSource = "Manual" }) => {
    const id = newId("comment");
    const ts = nowIso();
    const record = {
      id,
      ticketId: taskId,
      parentCommentId,
      created: ts,
      updated: ts,
      author: user?.fullName || user?.primaryEmailAddress?.emailAddress || "You",
      text: text || "",
      jiraIssueLink,
      syncSource,
    };
    setTeam((s) => ({
      ...s,
      comments: [...s.comments, record],
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, commentCount: (t.commentCount || 0) + 1 } : t
      ),
    }));
    syncCall(() =>
      fetch("/api/team/state/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save comment");
      })
    );
    return id;
  }, [syncCall, user]);

  const deleteTeamComment = useCallback((commentId, taskId) => {
    const archivedAt = nowIso();
    setTeam((s) => ({
      ...s,
      comments: archiveById(s.comments, commentId, archivedAt),
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, commentCount: Math.max(0, (t.commentCount || 0) - 1) }
          : t
      ),
    }));
    syncCall(() =>
      fetch(`/api/team/state/comments/${commentId}?taskId=${encodeURIComponent(taskId)}`, {
        method: "DELETE",
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete comment");
      })
    );
  }, [syncCall]);

  // `forOrgId` names the team being edited; it defaults to the selected one
  // so the Configuration screen keeps working unchanged.
  const updateTeamConfig = useCallback((key, values, forOrgId = null) => {
    const target = forOrgId || orgId;
    setTeam((s) => ({
      ...s,
      config: target === orgId ? { ...s.config, [key]: values } : s.config,
      configs: target
        ? { ...s.configs, [target]: { ...(s.configs?.[target] || {}), [key]: values } }
        : s.configs,
    }));
    syncCall(() =>
      fetch("/api/team/state/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, values, orgId: target }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update config");
      })
    );
  }, [syncCall, orgId]);

  // Notes load with the rest of the personal state so task pages can show
  // what's linked to a task. The notes screens still mutate through their own
  // routes, so they call this afterwards to keep both views in step.
  const refreshNotes = useCallback(async () => {
    try {
      const notes = await fetchJson("/api/notes");
      setPersonal((s) => ({ ...s, notes }));
    } catch (err) {
      console.warn("Failed to refresh notes", err);
    }
  }, []);

  // Progress is derived rather than read straight from the column — see
  // lib/progress.js. Deriving it once here means the table, board, detail
  // pages, sorting, and Auto Docs all agree without each redoing the work.
  const personalTasks = useMemo(
    () => withComputedProgress(personal.tasks, personal.config?.statusProgress),
    [personal.tasks, personal.config]
  );
  const teamTasks = useMemo(
    () => withComputedProgress(team.tasks, activeTeamConfig.statusProgress),
    [team.tasks, activeTeamConfig]
  );

  // Archived records travel in the same payload as live ones, but the
  // context hands out the live set by default. Every count, total, board
  // column and picker in the app reads these, and a screen that has not
  // thought about archiving should never be the place an archived record
  // reappears — opting in is a deliberate act, under `archived`.
  const liveTasks = useMemo(() => withoutArchived(personalTasks), [personalTasks]);
  const liveTeamTasks = useMemo(() => withoutArchived(teamTasks), [teamTasks]);
  const liveComments = useMemo(() => withoutArchived(personal.comments), [personal.comments]);
  const liveTeamComments = useMemo(() => withoutArchived(team.comments), [team.comments]);
  const liveNotes = useMemo(() => withoutArchived(personal.notes), [personal.notes]);
  const livePersonalEvents = useMemo(() => withoutArchived(personalEvents), [personalEvents]);
  const liveTeamEvents = useMemo(() => withoutArchived(teamEvents), [teamEvents]);
  const liveTimeEntries = useMemo(() => withoutArchived(timeEntries), [timeEntries]);

  /**
   * May this person do `permission` in a team — the selected one unless
   * another is named, because a page can show a team other than the one
   * switched to.
   *
   * This decides which controls are drawn, and nothing more. Every route
   * checks the same permission itself, so a hidden button is a courtesy, not
   * the boundary.
   */
  const canInTeam = useCallback(
    (permission, forOrgId = null) =>
      hasPermission(team.permissions?.[forOrgId || orgId] || [], permission),
    [team.permissions, orgId]
  );

  /** Does this person administer the team — the selected one unless named? */
  const isTeamAdmin = useCallback(
    (forOrgId = null) => Boolean(team.admins?.[forOrgId || orgId]),
    [team.admins, orgId]
  );

  // Everything archived, grouped by record type — what the Archive page
  // renders, and what an in-list "Show archived" toggle draws from.
  const archived = useMemo(
    () => ({
      task: onlyArchived(personalTasks),
      teamTask: onlyArchived(teamTasks),
      note: onlyArchived(personal.notes),
      comment: onlyArchived(personal.comments),
      teamComment: onlyArchived(team.comments),
      event: onlyArchived(personalEvents),
      teamEvent: onlyArchived(teamEvents),
      timeEntry: onlyArchived(timeEntries),
    }),
    [
      personalTasks,
      teamTasks,
      personal.notes,
      personal.comments,
      team.comments,
      personalEvents,
      teamEvents,
      timeEntries,
    ]
  );

  // ---------------------------------------------------------------------
  // Time tracking
  // ---------------------------------------------------------------------

  const refreshTime = useCallback(async () => {
    try {
      setTimeEntries(await fetchJson("/api/time/entries"));
    } catch (err) {
      console.warn("Failed to refresh time entries", err);
    }
  }, []);

  // Every mutator re-reads the list afterwards rather than patching state
  // locally: ids and durations are stamped by the server (so a wrong clock on
  // this device cannot inflate tracked time), and starting a timer implicitly
  // stops whichever one was already running.
  const timeRequest = useCallback(
    async (url, options, failure) => {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(failure);
      await refreshTime();
    },
    [refreshTime]
  );

  const startTimer = useCallback(
    ({ taskId = null, scope = "personal", orgId = null, description = "" } = {}) =>
      timeRequest(
        "/api/time/entries",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, scope, orgId, description }),
        },
        "Failed to start the timer"
      ),
    [timeRequest]
  );

  const stopTimer = useCallback(
    (id) =>
      timeRequest(
        `/api/time/entries/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stop: true }),
        },
        "Failed to stop the timer"
      ),
    [timeRequest]
  );

  // A finished stretch of work: manual entry, or a completed Pomodoro.
  const logTime = useCallback(
    (entry) =>
      timeRequest(
        "/api/time/entries",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        },
        "Failed to log the time"
      ),
    [timeRequest]
  );

  const updateTimeEntry = useCallback(
    (id, patch) =>
      timeRequest(
        `/api/time/entries/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        },
        "Failed to update the entry"
      ),
    [timeRequest]
  );

  const deleteTimeEntry = useCallback(
    (id) =>
      timeRequest(`/api/time/entries/${id}`, { method: "DELETE" }, "Failed to delete the entry"),
    [timeRequest]
  );

  // Restoring and permanently deleting go through one route for every record
  // type (api/archive), so this is one pair of actions rather than eight.
  // Both re-sync afterwards: a restored record has to reappear in its list,
  // and a purged one has to leave the Archive page.
  // Restoring or purging can touch any table, and which one is not worth
  // tracking — a re-read of everything is a handful of requests on an action
  // taken a few times a session, not something that runs while you work.
  // Each route is caught on its own so one failure cannot blank the rest.
  const refreshEverything = useCallback(async () => {
    const [state, teamState, events, teamEvents_, entries] = await Promise.all([
      fetchJson("/api/state").catch(() => null),
      fetchJson("/api/team/state").catch(() => null),
      fetchJson("/api/calendar/events").catch(() => null),
      fetchJson("/api/team/calendar/events").catch(() => null),
      fetchJson("/api/time/entries").catch(() => null),
    ]);

    if (state) {
      setPersonal({
        tasks: state.tasks,
        comments: state.comments,
        notes: state.notes || [],
        config: state.config,
      });
    }
    if (teamState) {
      setTeam((prev) => ({
        ...prev,
        tasks: teamState.tasks,
        comments: teamState.comments,
        configs: teamState.configs || {},
        defaults: teamState.defaults || EMPTY_TEAM_CONFIG,
        orgs: teamState.orgs || [],
        permissions: teamState.permissions || {},
        admins: teamState.admins || {},
      }));
    }
    if (events) setPersonalEvents(events);
    if (teamEvents_) setTeamEvents(teamEvents_);
    if (entries) setTimeEntries(entries);
  }, []);

  const restoreArchived = useCallback(
    async (type, id) => {
      const res = await fetch(`/api/archive/${type}/${id}`, { method: "POST" });
      if (!res.ok) throw new Error("Couldn't restore that");
      await refreshEverything();
    },
    [refreshEverything]
  );

  const deleteArchivedForever = useCallback(
    async (type, id) => {
      const res = await fetch(`/api/archive/${type}/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't delete that");
      await refreshEverything();
    },
    [refreshEverything]
  );

  const runningEntry = useMemo(
    () => liveTimeEntries.find((e) => !e.endedAt) || null,
    [liveTimeEntries]
  );

  const value = useMemo(
    () => ({
      personal: {
        tasks: liveTasks,
        comments: liveComments,
        notes: liveNotes,
        // Live plus archived — for the Notes and Task lists' "Show archived".
        allTasks: personalTasks,
        allComments: personal.comments,
        allNotes: personal.notes,
        refreshNotes,
        config: personal.config,
        events: livePersonalEvents,
        allEvents: personalEvents,
        hydrated: personalHydrated,
        addEvent: addPersonalEvent,
        deleteEvent: deletePersonalEvent,
        addTask,
        updateTask,
        deleteTask,
        addComment,
        deleteComment,
        updateConfig,
        mergeJiraIssues,
        resetToSeed,
      },
      team: {
        permissions: team.permissions,
        can: canInTeam,
        isAdmin: isTeamAdmin,
        tasks: liveTeamTasks,
        comments: liveTeamComments,
        allTasks: teamTasks,
        allComments: team.comments,
        config: activeTeamConfig,
        configs: team.configs,
        orgs: team.orgs,
        events: liveTeamEvents,
        allEvents: teamEvents,
        members,
        orgId,
        orgName,
        hydrated: teamHydrated,
        addEvent: addTeamEvent,
        deleteEvent: deleteTeamEvent,
        addTask: addTeamTask,
        updateTask: updateTeamTask,
        deleteTask: deleteTeamTask,
        addComment: addTeamComment,
        deleteComment: deleteTeamComment,
        updateConfig: updateTeamConfig,
      },
      time: {
        entries: liveTimeEntries,
        allEntries: timeEntries,
        running: runningEntry,
        start: startTimer,
        stop: stopTimer,
        log: logTime,
        update: updateTimeEntry,
        remove: deleteTimeEntry,
        refresh: refreshTime,
      },
      archive: {
        records: archived,
        restore: restoreArchived,
        deleteForever: deleteArchivedForever,
      },
      hydrated: personalHydrated && teamHydrated,
      syncError,
      retrySync,
      dismissSyncError,
    }),
    [
      personal,
      personalTasks,
      liveTasks,
      liveComments,
      liveNotes,
      liveTeamTasks,
      liveTeamComments,
      livePersonalEvents,
      liveTeamEvents,
      liveTimeEntries,
      canInTeam,
      isTeamAdmin,
      archived,
      restoreArchived,
      deleteArchivedForever,
      refreshNotes,
      personalHydrated,
      personalEvents,
      addPersonalEvent,
      deletePersonalEvent,
      teamEvents,
      addTeamEvent,
      deleteTeamEvent,
      addTask,
      updateTask,
      deleteTask,
      addComment,
      deleteComment,
      updateConfig,
      mergeJiraIssues,
      resetToSeed,
      team,
      activeTeamConfig,
      teamTasks,
      members,
      orgId,
      orgName,
      teamHydrated,
      addTeamTask,
      updateTeamTask,
      deleteTeamTask,
      addTeamComment,
      deleteTeamComment,
      updateTeamConfig,
      syncError,
      retrySync,
      dismissSyncError,
      timeEntries,
      runningEntry,
      startTimer,
      stopTimer,
      logTime,
      updateTimeEntry,
      deleteTimeEntry,
      refreshTime,
    ]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used within a TaskProvider");
  return ctx;
}

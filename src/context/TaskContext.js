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
import { useAuth, useUser } from "@clerk/nextjs";
import seed from "@/data/seed.json";
import { newId, nowIso, todayIso } from "@/lib/id";
import { STORAGE_KEY } from "@/lib/constants";
import { useConfirm } from "@/components/ConfirmProvider";

const TaskContext = createContext(null);
const IMPORT_OFFERED_KEY = "taskar:import-offered:v1";
const EMPTY_TEAM_CONFIG = { statuses: [], priorities: [], types: [], assignees: [] };

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
  const confirm = useConfirm();

  const [personal, setPersonal] = useState({
    tasks: seed.tasks,
    comments: seed.comments,
    config: seed.config,
  });
  const [personalHydrated, setPersonalHydrated] = useState(false);
  const lastUserIdRef = useRef(undefined);

  const [team, setTeam] = useState({ tasks: [], comments: [], config: EMPTY_TEAM_CONFIG });
  const [members, setMembers] = useState([]);
  const [teamHydrated, setTeamHydrated] = useState(false);
  const lastOrgIdRef = useRef(undefined);

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

  // Fetches team members and folds the result into team.config.assignees.
  // A standalone stable callback (not inlined below) so it can double as
  // the retryable request handed to `syncCall` on failure, and so it can
  // discard a stale in-flight result if the active org changed underneath
  // it (checked via lastOrgIdRef, which is updated synchronously before any
  // async work starts in the effect below).
  const loadMembers = useCallback(async () => {
    const orgIdAtFetchStart = lastOrgIdRef.current;
    const list = await fetchMembers();
    if (lastOrgIdRef.current !== orgIdAtFetchStart) return list;
    setMembers(list);
    setTeam((s) => ({ ...s, config: { ...s.config, assignees: list.map((m) => m.name) } }));
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
      setPersonal({ tasks: [], comments: [], config: seed.config });
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

        if (cancelled) return;
        setPersonal({ tasks: server.tasks, comments: server.comments, config: server.config });
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

    const orgChanged = lastOrgIdRef.current !== undefined && lastOrgIdRef.current !== orgId;
    if (orgChanged || !orgId) {
      setTeamHydrated(false);
      setTeam({ tasks: [], comments: [], config: EMPTY_TEAM_CONFIG });
      setMembers([]);
    }
    lastOrgIdRef.current = orgId;

    if (!orgId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTeamHydrated(true);
      return;
    }

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
        if (cancelled) return;
        setTeam({
          tasks: server.tasks,
          comments: server.comments,
          config: { ...server.config, assignees: memberList.map((m) => m.name) },
        });
      } catch (err) {
        console.warn("Failed to load team taskar state from server", err);
      } finally {
        if (!cancelled) setTeamHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, orgId, syncCall, loadMembers]);

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

  const deleteTask = useCallback((id) => {
    setPersonal((s) => ({
      ...s,
      tasks: s.tasks
        .filter((t) => t.id !== id)
        .map((t) => (t.parentId === id ? { ...t, parentId: null } : t)),
      comments: s.comments.filter((c) => c.ticketId !== id),
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
    setPersonal((s) => ({
      ...s,
      comments: s.comments.filter((c) => c.id !== commentId),
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
    setPersonal({ tasks: seed.tasks, comments: seed.comments, config: seed.config });
    syncCall(() =>
      fetch("/api/state/reset", { method: "POST" }).then((res) => {
        if (!res.ok) throw new Error("Failed to reset data");
      })
    );
  }, [syncCall]);

  // ---------------------------------------------------------------------
  // Team mutators
  // ---------------------------------------------------------------------

  const addTeamTask = useCallback((task) => {
    const id = newId("task");
    const ts = nowIso();
    const assigneeIds = resolveAssigneeIds(task.assigneeIds, members);
    const record = {
      id,
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
  }, [syncCall, members]);

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

  const deleteTeamTask = useCallback((id) => {
    setTeam((s) => ({
      ...s,
      tasks: s.tasks
        .filter((t) => t.id !== id)
        .map((t) => (t.parentId === id ? { ...t, parentId: null } : t)),
      comments: s.comments.filter((c) => c.ticketId !== id),
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
    setTeam((s) => ({
      ...s,
      comments: s.comments.filter((c) => c.id !== commentId),
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

  const updateTeamConfig = useCallback((key, values) => {
    setTeam((s) => ({ ...s, config: { ...s.config, [key]: values } }));
    syncCall(() =>
      fetch("/api/team/state/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, values }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update config");
      })
    );
  }, [syncCall]);

  const value = useMemo(
    () => ({
      personal: {
        tasks: personal.tasks,
        comments: personal.comments,
        config: personal.config,
        hydrated: personalHydrated,
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
        tasks: team.tasks,
        comments: team.comments,
        config: team.config,
        members,
        orgId,
        hydrated: teamHydrated,
        addTask: addTeamTask,
        updateTask: updateTeamTask,
        deleteTask: deleteTeamTask,
        addComment: addTeamComment,
        deleteComment: deleteTeamComment,
        updateConfig: updateTeamConfig,
      },
      hydrated: personalHydrated && teamHydrated,
      syncError,
      retrySync,
      dismissSyncError,
    }),
    [
      personal,
      personalHydrated,
      addTask,
      updateTask,
      deleteTask,
      addComment,
      deleteComment,
      updateConfig,
      mergeJiraIssues,
      resetToSeed,
      team,
      members,
      orgId,
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
    ]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used within a TaskProvider");
  return ctx;
}

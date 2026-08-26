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

async function fetchState(orgId) {
  const res = await fetch(orgId ? "/api/team/state" : "/api/state");
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

export function TaskProvider({ children }) {
  const { isLoaded, isSignedIn, userId, orgId } = useAuth();
  const { user } = useUser();
  const confirm = useConfirm();
  const [state, setState] = useState({
    tasks: seed.tasks,
    comments: seed.comments,
    config: seed.config,
  });
  const [members, setMembers] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const failedRequestRef = useRef(null);
  const lastUserIdRef = useRef(undefined);
  const lastOrgIdRef = useRef(undefined);

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

  // Fetches team members and folds the result into state. Defined as a
  // standalone, stable callback (not inlined in the load effect below) so
  // it can double as the retryable request handed to `syncCall`: on the
  // initial attempt we await it directly (so the result can land in the
  // same pass as the tasks/comments state), and if that attempt fails we
  // hand this exact function to `syncCall`, which is what every other sync
  // failure in this file already uses to power the "Retry" button
  // (`failedRequestRef.current`) and to self-clear `syncError` once a
  // later call succeeds.
  const loadMembers = useCallback(async () => {
    const list = await fetchMembers();
    setMembers(list);
    setState((s) => ({
      ...s,
      config: { ...s.config, assignees: list.map((m) => m.name) },
    }));
    return list;
  }, []);

  // Load state from the server once signed in. Re-runs, resetting local
  // state first, whenever the signed-in user OR the active Clerk
  // organization changes (Clerk's account switcher and OrganizationSwitcher
  // can both change context without a full page reload) — so a previous
  // account's or team's data never lingers on screen. The one-time legacy
  // localStorage import only applies to the personal space.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    const identityChanged =
      (lastUserIdRef.current !== undefined && lastUserIdRef.current !== userId) ||
      (lastOrgIdRef.current !== undefined && lastOrgIdRef.current !== orgId);
    if (identityChanged) {
      setHydrated(false);
      setState({ tasks: [], comments: [], config: seed.config });
      setMembers([]);
    }
    lastUserIdRef.current = userId;
    lastOrgIdRef.current = orgId;

    (async () => {
      try {
        let server = await fetchState(orgId);

        if (!orgId) {
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
              if (res.ok) {
                server = await fetchState(orgId);
              }
            }
          } else if (!alreadyOffered) {
            window.localStorage.setItem(IMPORT_OFFERED_KEY, "1");
          }
        }

        let memberList = [];
        if (orgId) {
          try {
            memberList = await fetchMembers();
          } catch (err) {
            // Don't let a members-fetch failure abort the whole load — the
            // task/comment state above already succeeded. Only hand off to
            // syncCall (which surfaces the error via the shared syncError
            // banner and wires up Retry) if this effect run is still the
            // current one — a superseded run (user already switched org or
            // account again) must not raise a phantom error for a team the
            // user has already navigated away from.
            console.warn("Failed to load team members", err);
            if (!cancelled) syncCall(loadMembers);
          }
        }

        if (cancelled) return;
        setState({
          tasks: server.tasks,
          comments: server.comments,
          // Team config has no `assignees` key server-side (team assignees
          // come from Clerk membership, not a hand-typed list — see Task 3).
          // Synthesizing it here as the members' display names means every
          // existing consumer that reads `config.assignees` (TaskFiltersPanel,
          // the task detail page) keeps working unchanged: they filter/display
          // by name, and `task.assignee` for a team task is already a
          // resolved display name (see `rowToTeamTask`, Task 4).
          config: orgId
            ? { ...server.config, assignees: memberList.map((m) => m.name) }
            : server.config,
        });
        setMembers(memberList);
      } catch (err) {
        console.warn("Failed to load taskar state from server", err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, orgId, confirm, syncCall, loadMembers]);

  const addTask = useCallback((task) => {
    const id = newId("task");
    const ts = nowIso();
    let resolved;
    if (!orgId) {
      resolved = { assignee: task.assignee || "Unassigned", assigneeId: null };
    } else {
      // `assignee` and `assigneeId` must never disagree about whether
      // someone is actually assigned: if the given id doesn't resolve to a
      // known member (e.g. `members` hasn't loaded yet, or failed to load),
      // treat it the same as no assignment on both fields rather than
      // stamping a real id next to a display name of "Unassigned".
      const match = task.assignee ? members.find((m) => m.id === task.assignee) : null;
      resolved = match
        ? { assignee: match.name, assigneeId: match.id }
        : { assignee: "Unassigned", assigneeId: null };
    }
    const record = {
      id,
      ticketId: task.ticketId?.trim() || "N/A",
      parentId: task.parentId || null,
      type: task.type || "Task",
      name: task.name?.trim() || "Untitled task",
      status: task.status || "Not Started",
      priority: task.priority || "Normal",
      ...resolved,
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
    setState((s) => ({ ...s, tasks: [...s.tasks, record] }));
    const base = orgId ? "/api/team/state/tasks" : "/api/state/tasks";
    syncCall(() =>
      fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save task");
      })
    );
    return id;
  }, [syncCall, orgId, members]);

  const updateTask = useCallback((id, patch) => {
    const resolvedPatch = { ...patch };
    if (orgId && "assignee" in patch) {
      // Same rule as addTask: an unresolvable id must not leave assignee and
      // assigneeId disagreeing about whether someone is assigned.
      const match = patch.assignee ? members.find((m) => m.id === patch.assignee) : null;
      resolvedPatch.assignee = match ? match.name : "Unassigned";
      resolvedPatch.assigneeId = match ? match.id : null;
    }
    const fullPatch = { ...resolvedPatch, lastUpdate: todayIso(), updatedAt: nowIso() };
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...fullPatch } : t)),
    }));
    const base = orgId ? `/api/team/state/tasks/${id}` : `/api/state/tasks/${id}`;
    syncCall(() =>
      fetch(base, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullPatch),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update task");
      })
    );
  }, [syncCall, orgId, members]);

  const deleteTask = useCallback((id) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks
        .filter((t) => t.id !== id)
        .map((t) => (t.parentId === id ? { ...t, parentId: null } : t)),
      comments: s.comments.filter((c) => c.ticketId !== id),
    }));
    const base = orgId ? `/api/team/state/tasks/${id}` : `/api/state/tasks/${id}`;
    syncCall(() =>
      fetch(base, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete task");
      })
    );
  }, [syncCall, orgId]);

  const addComment = useCallback((taskId, { author, text, parentCommentId = null, jiraIssueLink = null, syncSource = "Manual" }) => {
    const id = newId("comment");
    const ts = nowIso();
    const record = {
      id,
      ticketId: taskId,
      parentCommentId,
      created: ts,
      updated: ts,
      author: orgId
        ? user?.fullName || user?.primaryEmailAddress?.emailAddress || "You"
        : author || "Me",
      text: text || "",
      jiraIssueLink,
      syncSource,
    };
    setState((s) => ({
      ...s,
      comments: [...s.comments, record],
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, commentCount: (t.commentCount || 0) + 1 } : t
      ),
    }));
    const base = orgId ? "/api/team/state/comments" : "/api/state/comments";
    syncCall(() =>
      fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to save comment");
      })
    );
    return id;
  }, [syncCall, orgId, user]);

  const deleteComment = useCallback((commentId, taskId) => {
    setState((s) => ({
      ...s,
      comments: s.comments.filter((c) => c.id !== commentId),
      tasks: s.tasks.map((t) =>
        t.id === taskId
          ? { ...t, commentCount: Math.max(0, (t.commentCount || 0) - 1) }
          : t
      ),
    }));
    const base = orgId
      ? `/api/team/state/comments/${commentId}?taskId=${encodeURIComponent(taskId)}`
      : `/api/state/comments/${commentId}?taskId=${encodeURIComponent(taskId)}`;
    syncCall(() =>
      fetch(base, { method: "DELETE" }).then((res) => {
        if (!res.ok) throw new Error("Failed to delete comment");
      })
    );
  }, [syncCall, orgId]);

  const updateConfig = useCallback((key, values) => {
    setState((s) => ({ ...s, config: { ...s.config, [key]: values } }));
    const base = orgId ? "/api/team/state/config" : "/api/state/config";
    syncCall(() =>
      fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, values }),
      }).then((res) => {
        if (!res.ok) throw new Error("Failed to update config");
      })
    );
  }, [syncCall, orgId]);

  // Merge Jira-sourced issues (one-way pull). Matches by ticketId; creates new
  // tasks for issues we haven't seen, updates Jira-owned fields on existing
  // ones, and never touches tasks whose syncSource is "Manual". Reads
  // `state.tasks` directly (not via a setState updater) so the same records
  // used to update local state are the ones sent to the API. Personal-only —
  // Jira import into a team board is out of scope for this phase.
  const mergeJiraIssues = useCallback((issues) => {
    if (orgId) return { created: 0, updated: 0 };
    const byTicket = new Map(state.tasks.map((t) => [t.ticketId, t]));
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
      ...state.tasks.map((t) => updateById.get(t.id) || t),
      ...toCreate,
    ];
    setState((s) => ({ ...s, tasks: nextTasks }));

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
  }, [state.tasks, syncCall, orgId]);

  // Demo-data reset. Personal-only — a team board has no seed content.
  const resetToSeed = useCallback(() => {
    if (orgId) return;
    setState({ tasks: seed.tasks, comments: seed.comments, config: seed.config });
    syncCall(() =>
      fetch("/api/state/reset", { method: "POST" }).then((res) => {
        if (!res.ok) throw new Error("Failed to reset data");
      })
    );
  }, [syncCall, orgId]);

  const value = useMemo(
    () => ({
      tasks: state.tasks,
      comments: state.comments,
      config: state.config,
      orgId,
      members,
      hydrated,
      syncError,
      retrySync,
      dismissSyncError,
      addTask,
      updateTask,
      deleteTask,
      addComment,
      deleteComment,
      updateConfig,
      mergeJiraIssues,
      resetToSeed,
    }),
    [
      state,
      orgId,
      members,
      hydrated,
      syncError,
      retrySync,
      dismissSyncError,
      addTask,
      updateTask,
      deleteTask,
      addComment,
      deleteComment,
      updateConfig,
      mergeJiraIssues,
      resetToSeed,
    ]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used within a TaskProvider");
  return ctx;
}

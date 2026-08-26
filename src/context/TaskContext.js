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
import { useAuth } from "@clerk/nextjs";
import seed from "@/data/seed.json";
import { newId, nowIso, todayIso } from "@/lib/id";
import { STORAGE_KEY } from "@/lib/constants";
import { useConfirm } from "@/components/ConfirmProvider";

const TaskContext = createContext(null);
const IMPORT_OFFERED_KEY = "taskar:import-offered:v1";

async function fetchState() {
  const res = await fetch("/api/state");
  if (!res.ok) throw new Error(`Failed to load state (${res.status})`);
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
  const { isLoaded, isSignedIn, userId } = useAuth();
  const confirm = useConfirm();
  const [state, setState] = useState({
    tasks: seed.tasks,
    comments: seed.comments,
    config: seed.config,
  });
  const [hydrated, setHydrated] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const failedRequestRef = useRef(null);
  const lastUserIdRef = useRef(undefined);

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

  // Load state from the server once signed in; offer a one-time import of
  // this browser's pre-cloud-sync localStorage data if the account is new.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;

    // Switched accounts (e.g. Clerk's account switcher) without a full page
    // reload — clear the previous account's data immediately so it never
    // lingers on screen while the new account's state loads.
    if (lastUserIdRef.current !== undefined && lastUserIdRef.current !== userId) {
      setHydrated(false);
      setState({ tasks: [], comments: [], config: seed.config });
    }
    lastUserIdRef.current = userId;

    (async () => {
      try {
        let server = await fetchState();

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
              server = await fetchState();
            }
          }
        } else if (!alreadyOffered) {
          window.localStorage.setItem(IMPORT_OFFERED_KEY, "1");
        }

        if (cancelled) return;
        setState({
          tasks: server.tasks,
          comments: server.comments,
          config: server.config,
        });
      } catch (err) {
        console.warn("Failed to load taskar state from server", err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, userId, confirm]);

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
    setState((s) => ({ ...s, tasks: [...s.tasks, record] }));
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
    setState((s) => ({
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
    setState((s) => ({
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
    setState((s) => ({
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
    setState((s) => ({
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
    setState((s) => ({ ...s, config: { ...s.config, [key]: values } }));
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
  // `state.tasks` directly (not via a setState updater) so the same records
  // used to update local state are the ones sent to the API.
  const mergeJiraIssues = useCallback((issues) => {
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
  }, [state.tasks, syncCall]);

  const resetToSeed = useCallback(() => {
    setState({ tasks: seed.tasks, comments: seed.comments, config: seed.config });
    syncCall(() =>
      fetch("/api/state/reset", { method: "POST" }).then((res) => {
        if (!res.ok) throw new Error("Failed to reset data");
      })
    );
  }, [syncCall]);

  const value = useMemo(
    () => ({
      tasks: state.tasks,
      comments: state.comments,
      config: state.config,
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

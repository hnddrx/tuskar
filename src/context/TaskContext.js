"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import seed from "@/data/seed.json";
import { newId, nowIso, todayIso } from "@/lib/id";
import { STORAGE_KEY } from "@/lib/constants";

const TaskContext = createContext(null);

function loadInitialState() {
  if (typeof window === "undefined") {
    return { tasks: seed.tasks, comments: seed.comments, config: seed.config };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tasks)) {
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
      }
    }
  } catch (err) {
    console.warn("Failed to load taskar state from localStorage", err);
  }
  return { tasks: seed.tasks, comments: seed.comments, config: seed.config };
}

export function TaskProvider({ children }) {
  const [state, setState] = useState(() => ({
    tasks: seed.tasks,
    comments: seed.comments,
    config: seed.config,
  }));
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (client only, avoids SSR mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(loadInitialState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("Failed to persist taskar state to localStorage", err);
    }
  }, [state, hydrated]);

  const addTask = useCallback((task) => {
    const id = newId("task");
    const ts = nowIso();
    setState((s) => ({
      ...s,
      tasks: [
        ...s.tasks,
        {
          id,
          ticketId: task.ticketId?.trim() || "N/A",
          parentId: task.parentId || null,
          type: task.type || "Task",
          name: task.name?.trim() || "Untitled task",
          status: task.status || s.config.statuses[0] || "Not Started",
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
        },
      ],
    }));
    return id;
  }, []);

  const updateTask = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              ...patch,
              lastUpdate: todayIso(),
              updatedAt: nowIso(),
            }
          : t
      ),
    }));
  }, []);

  const deleteTask = useCallback((id) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks
        .filter((t) => t.id !== id)
        .map((t) => (t.parentId === id ? { ...t, parentId: null } : t)),
      comments: s.comments.filter((c) => c.ticketId !== id),
    }));
  }, []);

  const addComment = useCallback((taskId, { author, text, parentCommentId = null, jiraIssueLink = null, syncSource = "Manual" }) => {
    const id = newId("comment");
    const ts = nowIso();
    setState((s) => ({
      ...s,
      comments: [
        ...s.comments,
        {
          id,
          ticketId: taskId,
          parentCommentId,
          created: ts,
          updated: ts,
          author: author || "Me",
          text: text || "",
          jiraIssueLink,
          syncSource,
        },
      ],
      tasks: s.tasks.map((t) =>
        t.id === taskId ? { ...t, commentCount: (t.commentCount || 0) + 1 } : t
      ),
    }));
    return id;
  }, []);

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
  }, []);

  const updateConfig = useCallback((key, values) => {
    setState((s) => ({
      ...s,
      config: { ...s.config, [key]: values },
    }));
  }, []);

  // Merge Jira-sourced issues (one-way pull). Matches by ticketId; creates new
  // tasks for issues we haven't seen, updates Jira-owned fields on existing ones,
  // and never touches tasks whose syncSource is "Manual".
  const mergeJiraIssues = useCallback((issues) => {
    let created = 0;
    let updated = 0;
    setState((s) => {
      const byTicket = new Map(s.tasks.map((t) => [t.ticketId, t]));
      const tasks = [...s.tasks];
      for (const issue of issues) {
        const existing = byTicket.get(issue.ticketId);
        if (existing) {
          const idx = tasks.findIndex((t) => t.id === existing.id);
          tasks[idx] = {
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
            updatedAt: nowIso(),
          };
          updated += 1;
        } else {
          const id = newId("task");
          tasks.push({
            id,
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
            createdAt: nowIso(),
            updatedAt: nowIso(),
          });
          created += 1;
        }
      }
      return { ...s, tasks };
    });
    return { created, updated };
  }, []);

  const resetToSeed = useCallback(() => {
    setState({ tasks: seed.tasks, comments: seed.comments, config: seed.config });
  }, []);

  const value = useMemo(
    () => ({
      tasks: state.tasks,
      comments: state.comments,
      config: state.config,
      hydrated,
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

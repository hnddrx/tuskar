"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import TeamAssigneePicker from "@/components/TeamAssigneePicker";

const EMPTY = {
  ticketId: "",
  parentId: "",
  type: "Task",
  name: "",
  status: "",
  priority: "Normal",
  assigneeIds: [],
  startDate: "",
  targetDate: "",
  progress: 0,
  progressAuto: true,
  description: "",
  githubBranch: "",
  jiraLink: "",
};

export default function TeamTaskFormModal({ open, onClose, task = null }) {
  const { team: { config, addTask, updateTask, tasks, members } } = useTasks();
  const [form, setForm] = useState(EMPTY);
  const isEdit = Boolean(task);

  // Reset the form whenever the modal opens or the target task changes.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(
        task
          ? {
              ticketId: task.ticketId === "N/A" ? "" : task.ticketId,
              parentId: task.parentId || "",
              type: task.type,
              name: task.name,
              status: task.status,
              priority: task.priority,
              assigneeIds: task.assigneeIds || [],
              startDate: task.startDate || "",
              targetDate: task.targetDate || "",
              progress: task.progress || 0,
              progressAuto: task.progressAuto !== false,
              description: task.description || "",
              githubBranch: task.githubBranch === "N/A" ? "" : task.githubBranch,
              jiraLink: task.jiraLink || "",
            }
          : { ...EMPTY, status: config.statuses[0] || "Not Started" }
      );
    }
  }, [open, task, config.statuses]);

  if (!open) return null;

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      ...form,
      ticketId: form.ticketId.trim() || "N/A",
      parentId: form.parentId || null,
      githubBranch: form.githubBranch.trim() || "N/A",
      jiraLink: form.jiraLink.trim() || null,
    };
    if (isEdit) {
      updateTask(task.id, payload);
    } else {
      addTask(payload);
    }
    onClose();
  }

  const parentOptions = tasks.filter(
    (t) => t.id !== task?.id && t.type !== "Subtask"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div className="flex h-full w-full flex-col overflow-y-auto bg-white shadow-xl dark:bg-slate-900 sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? `Edit ${task.ticketId}` : "New team task"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Task name *
            </label>
            <input
              autoFocus
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              placeholder="e.g. Bank Reconciliation"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Ticket ID
              </label>
              <input
                value={form.ticketId}
                onChange={(e) => set("ticketId", e.target.value)}
                placeholder="N/A"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Type
              </label>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              >
                {config.types.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Parent task (for subtasks)
            </label>
            <select
              value={form.parentId}
              onChange={(e) => set("parentId", e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
            >
              <option value="">None</option>
              {parentOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.ticketId} — {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              >
                {config.statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Priority
              </label>
              <select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              >
                {config.priorities.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Assignees
              </label>
              <TeamAssigneePicker
                members={members}
                selectedIds={form.assigneeIds}
                onChange={(ids) => set("assigneeIds", ids)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Start date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Target date
              </label>
              <input
                type="date"
                value={form.targetDate}
                onChange={(e) => set("targetDate", e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Progress %
                </label>
                <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={form.progressAuto}
                    onChange={(e) => set("progressAuto", e.target.checked)}
                    className="h-3 w-3 accent-slate-900 dark:accent-slate-100"
                  />
                  Auto
                </label>
              </div>
              <input
                type="number"
                min={0}
                max={100}
                value={form.progress}
                disabled={form.progressAuto}
                onChange={(e) => set("progress", e.target.value)}
                title={
                  form.progressAuto
                    ? "Calculated from this task's status and subtasks"
                    : undefined
                }
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm transition-colors focus:border-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-800 dark:focus:border-slate-500 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Description
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                GitHub branch
              </label>
              <input
                value={form.githubBranch}
                onChange={(e) => set("githubBranch", e.target.value)}
                placeholder="N/A"
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Jira link
              </label>
              <input
                value={form.jiraLink}
                onChange={(e) => set("jiraLink", e.target.value)}
                placeholder="https://your-domain.atlassian.net/browse/..."
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none dark:border-slate-800 dark:focus:border-slate-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 transition-colors"
            >
              {isEdit ? "Save changes" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

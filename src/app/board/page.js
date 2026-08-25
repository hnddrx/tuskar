"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { PriorityBadge, SyncBadge } from "@/components/Badge";
import { ProgressBar } from "@/components/ProgressBar";
import TaskFormModal from "@/components/TaskFormModal";
import PageHeader from "@/components/PageHeader";
import { DONE_STATUSES } from "@/lib/constants";

const BOARD_FROM = new URLSearchParams({ from: "/board", fromLabel: "Board" }).toString();

export default function BoardPage() {
  const { tasks, config, updateTask } = useTasks();
  const [modalOpen, setModalOpen] = useState(false);
  const [dragId, setDragId] = useState(null);

  const columns = config.statuses;

  function onDrop(status) {
    if (dragId) {
      updateTask(dragId, { status });
      setDragId(null);
    }
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Board"
        subtitle="Drag a card to change its status."
        actions={
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus size={16} /> New task
          </button>
        }
        mobileFab={{ onClick: () => setModalOpen(true), label: "New task" }}
      />

      <div className="px-4 py-6 sm:px-8">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((status) => {
            const items = tasks.filter((t) => t.status === status);
            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(status)}
                className="w-64 shrink-0 rounded-xl bg-slate-100/70 p-3 sm:w-72 dark:bg-slate-800/60"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {status}
                  </h3>
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-xs text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                    {items.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}?${BOARD_FROM}`}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      className={`block cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:border-slate-300 active:cursor-grabbing transition-colors dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 ${
                        DONE_STATUSES.includes(status) ? "opacity-70" : ""
                      }`}
                    >
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                          {t.ticketId}
                        </span>
                        <PriorityBadge priority={t.priority} />
                      </div>
                      <p className="mb-2 text-sm font-medium leading-snug text-slate-800 dark:text-slate-200">
                        {t.name}
                      </p>
                      <ProgressBar value={t.progress} className="mb-2" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {t.assignee}
                        </span>
                        <SyncBadge source={t.syncSource} />
                      </div>
                    </Link>
                  ))}
                  {items.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-slate-400 dark:text-slate-500">
                      Nothing here
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <TaskFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

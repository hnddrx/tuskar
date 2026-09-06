"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import TaskFormModal from "@/components/TaskFormModal";
import PageHeader from "@/components/PageHeader";
import Board from "@/components/Board";
import { boardColumns } from "@/lib/board";

const BOARD_FROM = new URLSearchParams({ from: "/board", fromLabel: "Board" }).toString();

export default function BoardPage() {
  const { personal: { tasks, config, updateTask } } = useTasks();
  const [modalOpen, setModalOpen] = useState(false);

  const columns = useMemo(() => boardColumns(config.statuses, tasks), [config.statuses, tasks]);

  return (
    <div className="flex-1">
      <PageHeader
        title="My Board"
        scope="personal"
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
        <Board
          columns={columns}
          tasks={tasks}
          cardHref={(t) => `/tasks/${t.id}?${BOARD_FROM}`}
          assigneeLabel={(t) => t.assignee || "Unassigned"}
          onMove={updateTask}
        />
      </div>

      <TaskFormModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

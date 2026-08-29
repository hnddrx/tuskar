"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import { PriorityBadge, SyncBadge } from "@/components/Badge";
import { ProgressBar } from "@/components/ProgressBar";
import TeamTaskFormModal from "@/components/TeamTaskFormModal";
import PageHeader from "@/components/PageHeader";
import NoActiveTeam from "@/components/NoActiveTeam";
import { DONE_STATUSES } from "@/lib/constants";
import { TEAM_PARAM, resolveTeamScope, tasksForTeam, teamBoardHref } from "@/lib/teamScope";

export default function TeamBoardPage() {
  return (
    <Suspense fallback={<div className="flex-1 p-8 text-sm text-slate-400 dark:text-slate-500">Loading…</div>}>
      <TeamBoardPageInner />
    </Suspense>
  );
}

/**
 * A board is one team's board: its columns come from that team's statuses, so
 * there is no sensible merged view across teams. The team comes from "?team="
 * — the sidebar links here per team — and falls back to the selected team for
 * older links.
 */
function TeamBoardPageInner() {
  const { team: { tasks: allTasks, config, configs, orgs, updateTask, orgId, orgName } } = useTasks();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [dragId, setDragId] = useState(null);

  const teamScope = resolveTeamScope(searchParams.get(TEAM_PARAM), orgs);
  const boardOrgId = teamScope || orgId;

  if (!boardOrgId) return <NoActiveTeam title="Team Board" />;

  const boardName = orgs.find((o) => o.id === boardOrgId)?.name || orgName;
  const boardConfig = configs?.[boardOrgId] || config;
  const tasks = tasksForTeam(allTasks, boardOrgId);
  const columns = boardConfig.statuses;
  const boardFrom = new URLSearchParams({
    from: teamBoardHref(teamScope),
    fromLabel: "Team Board",
  }).toString();

  function onDrop(status) {
    if (dragId) {
      updateTask(dragId, { status });
      setDragId(null);
    }
  }

  return (
    <div className="flex-1">
      <PageHeader
        title="Team Board"
        scope="team"
        teamName={boardName}
        subtitle="Shared with everyone on this team. Drag a card to change its status."
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
                      href={`/team/tasks/${t.id}?${boardFrom}`}
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
                          {t.assignees?.length ? t.assignees.map((a) => a.name).join(", ") : "Unassigned"}
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

      <TeamTaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        orgId={boardOrgId}
      />
    </div>
  );
}

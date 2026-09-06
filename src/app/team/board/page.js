"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { useTasks } from "@/context/TaskContext";
import TeamTaskFormModal from "@/components/TeamTaskFormModal";
import PageHeader from "@/components/PageHeader";
import NoActiveTeam from "@/components/NoActiveTeam";
import Board from "@/components/Board";
import { boardColumns } from "@/lib/board";
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
  const {
    team: { tasks: allTasks, configs, defaults, orgs, can, updateTask, orgId, orgName, hydrated },
  } = useTasks();
  const searchParams = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);

  const teamScope = resolveTeamScope(searchParams.get(TEAM_PARAM), orgs);
  const boardOrgId = teamScope || orgId;

  const tasks = useMemo(() => tasksForTeam(allTasks, boardOrgId), [allTasks, boardOrgId]);
  // This team's statuses, falling back to what an unconfigured team starts
  // from. It used to fall back to the *selected* team's statuses, so opening
  // one team's board while another was selected drew the other team's columns.
  const boardConfig = configs?.[boardOrgId] || defaults;
  const columns = useMemo(
    () => boardColumns(boardConfig?.statuses, tasks),
    [boardConfig?.statuses, tasks],
  );

  // Which team is on screen is only known once the team list has arrived: a
  // "?team=" cannot be resolved against teams we have not been told about yet.
  // Deciding early drew the selected team's board, or "no team chosen", for a
  // moment before correcting itself.
  if (!hydrated) {
    return <div className="flex-1 p-8 text-sm text-slate-400 dark:text-slate-500">Loading…</div>;
  }
  if (!boardOrgId) return <NoActiveTeam title="Team Board" />;

  const boardName = orgs.find((o) => o.id === boardOrgId)?.name || orgName;
  // The routes check both of these too — withholding the control just avoids
  // offering a move that would come back refused, having already been drawn on
  // screen as though it had worked.
  const canMove = can("tasks.edit", boardOrgId);
  const canCreate = can("tasks.create", boardOrgId);
  const boardFrom = new URLSearchParams({
    from: teamBoardHref(teamScope),
    fromLabel: "Team Board",
  }).toString();

  return (
    <div className="flex-1">
      <PageHeader
        title="Team Board"
        scope="team"
        teamName={boardName}
        subtitle={
          canMove
            ? "Shared with everyone on this team. Drag a card to change its status."
            : "Shared with everyone on this team. You can open a card, but not move it."
        }
        actions={
          canCreate ? (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors dark:bg-slate-100 dark:text-slate-900"
            >
              <Plus size={16} /> New task
            </button>
          ) : null
        }
        mobileFab={canCreate ? { onClick: () => setModalOpen(true), label: "New task" } : null}
      />

      <div className="px-4 py-6 sm:px-8">
        <Board
          columns={columns}
          tasks={tasks}
          cardHref={(t) => `/team/tasks/${t.id}?${boardFrom}`}
          assigneeLabel={(t) =>
            t.assignees?.length ? t.assignees.map((a) => a.name).join(", ") : "Unassigned"
          }
          canMove={canMove}
          onMove={updateTask}
        />
      </div>

      <TeamTaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        orgId={boardOrgId}
      />
    </div>
  );
}

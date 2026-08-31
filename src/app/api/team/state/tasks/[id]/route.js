import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, getTeamMembersById, getUserOrgIds } from "@/lib/db";
import { getTeamAccess, requireTeamPermission } from "@/lib/teamPermissions";
import { taskMatchesRules } from "@/lib/recordRules";

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const patch = await request.json();
  const sql = getSql();

  // Look the task up by id, then check the caller belongs to its team. Scoping
  // the query to the active team instead would make a task from another team
  // fail as "not found" even though it is plainly on screen.
  const [existing] = await sql`select * from team_tasks where id = ${id}`;
  const orgIds = await getUserOrgIds(userId);
  if (!existing || !orgIds.includes(existing.org_id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const orgId = existing.org_id;

  const gate = await requireTeamPermission(userId, orgId, "tasks.edit");
  if (gate.error) return gate.error;

  // A task the rules hide is not merely absent from the list — it cannot be
  // edited by anyone who reaches its URL directly. Same evaluator as the feed.
  if (!taskMatchesRules(existing, gate.access.rules, userId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const membersById = await getTeamMembersById(orgId);
  const merged = { ...rowToTeamTask(existing, membersById), ...patch };

  const [row] = await sql`
    update team_tasks set
      ticket_id = ${merged.ticketId},
      parent_id = ${merged.parentId || null},
      type = ${merged.type},
      name = ${merged.name},
      status = ${merged.status},
      priority = ${merged.priority},
      assignee_ids = ${JSON.stringify(merged.assigneeIds || [])}::jsonb,
      start_date = ${merged.startDate || null},
      target_date = ${merged.targetDate || null},
      progress = ${merged.progress || 0},
      last_update = ${merged.lastUpdate || null},
      description = ${merged.description || ""},
      github_branch = ${merged.githubBranch || "N/A"},
      jira_link = ${merged.jiraLink || null},
      comment_count = ${merged.commentCount || 0},
      sync_source = ${merged.syncSource || "Manual"},
      updated_at = ${merged.updatedAt}
    where id = ${id} and org_id = ${orgId}
    returning *
  `;

  return Response.json(rowToTeamTask(row, membersById));
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const sql = getSql();

  // Deleting is authorised by membership of the task's own team, so the
  // delete cannot silently do nothing when another team is selected. The whole
  // row is read, not just its team: the record rules below are evaluated
  // against its assignees and author.
  const [existing] = await sql`select * from team_tasks where id = ${id}`;
  const orgIds = await getUserOrgIds(userId);
  if (!existing || !orgIds.includes(existing.org_id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const gate = await requireTeamPermission(userId, existing.org_id, "tasks.delete");
  if (gate.error) return gate.error;

  if (!taskMatchesRules(existing, gate.access.rules, userId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Archives rather than deletes — see lib/archive. Its comments go with it
  // so restoring the task brings the thread back; subtasks keep their
  // parent_id, since this is reversible and orphaning them would lose the
  // tree with no way to rebuild it.
  const archivedAt = new Date().toISOString();

  await sql`
    update team_comments set archived_at = ${archivedAt}
    where ticket_id = ${id} and org_id = ${existing.org_id} and archived_at is null
  `;
  await sql`
    update team_tasks set archived_at = ${archivedAt}
    where id = ${id} and org_id = ${existing.org_id}
  `;
  return Response.json({ ok: true, archivedAt });
}

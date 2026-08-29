import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, getTeamMembersById, getUserOrgIds } from "@/lib/db";

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
  // delete cannot silently do nothing when another team is selected.
  const [existing] = await sql`select org_id from team_tasks where id = ${id}`;
  const orgIds = await getUserOrgIds(userId);
  if (!existing || !orgIds.includes(existing.org_id)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await sql`delete from team_comments where ticket_id = ${id} and org_id = ${existing.org_id}`;
  await sql`update team_tasks set parent_id = null where parent_id = ${id} and org_id = ${existing.org_id}`;
  await sql`delete from team_tasks where id = ${id} and org_id = ${existing.org_id}`;
  return Response.json({ ok: true });
}

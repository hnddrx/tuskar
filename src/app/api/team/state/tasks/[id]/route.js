import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, getTeamMembersById } from "@/lib/db";

export async function PATCH(request, { params }) {
  const { orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const patch = await request.json();
  const sql = getSql();

  const [existing] = await sql`
    select * from team_tasks where id = ${id} and org_id = ${orgId}
  `;
  if (!existing) {
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
  const { orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const sql = getSql();
  await sql`delete from team_tasks where id = ${id} and org_id = ${orgId}`;
  return Response.json({ ok: true });
}

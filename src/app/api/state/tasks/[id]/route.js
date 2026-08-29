import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTask } from "@/lib/db";

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const patch = await request.json();
  const sql = getSql();

  const [existing] = await sql`
    select * from tasks where id = ${id} and user_id = ${userId}
  `;
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const merged = { ...rowToTask(existing), ...patch };

  const [row] = await sql`
    update tasks set
      ticket_id = ${merged.ticketId},
      parent_id = ${merged.parentId},
      type = ${merged.type},
      name = ${merged.name},
      status = ${merged.status},
      priority = ${merged.priority},
      assignee = ${merged.assignee},
      start_date = ${merged.startDate},
      target_date = ${merged.targetDate},
      progress = ${merged.progress},
      last_update = ${merged.lastUpdate},
      description = ${merged.description},
      github_branch = ${merged.githubBranch},
      jira_link = ${merged.jiraLink},
      comment_count = ${merged.commentCount},
      sync_source = ${merged.syncSource},
      progress_auto = ${merged.progressAuto !== false},
      updated_at = ${merged.updatedAt}
    where id = ${id} and user_id = ${userId}
    returning *
  `;

  return Response.json(rowToTask(row));
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const sql = getSql();

  await sql`delete from comments where ticket_id = ${id} and user_id = ${userId}`;
  await sql`update tasks set parent_id = null where parent_id = ${id} and user_id = ${userId}`;
  await sql`delete from tasks where id = ${id} and user_id = ${userId}`;

  return Response.json({ ok: true });
}

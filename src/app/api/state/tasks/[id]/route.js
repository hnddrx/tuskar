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

// Archives rather than deletes — see lib/archive. The task's comments are
// archived with it so restoring the task brings its thread back intact, and
// they are stamped with the same instant so the Archive page can tell the
// two apart from a comment archived on its own.
//
// Subtasks keep their parent_id: unlike a real delete this is reversible, and
// orphaning them would lose the tree with no way to rebuild it on restore.
// A subtask whose parent is archived stays visible on its own.
export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const sql = getSql();
  const archivedAt = new Date().toISOString();

  await sql`
    update comments set archived_at = ${archivedAt}
    where ticket_id = ${id} and user_id = ${userId} and archived_at is null
  `;
  await sql`
    update tasks set archived_at = ${archivedAt}
    where id = ${id} and user_id = ${userId}
  `;

  return Response.json({ ok: true, archivedAt });
}

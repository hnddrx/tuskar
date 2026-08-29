import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTask } from "@/lib/db";

export async function POST(request) {
  const { userId } = await auth();
  const task = await request.json();
  const sql = getSql();

  const [row] = await sql`
    insert into tasks (
      id, user_id, ticket_id, parent_id, type, name, status, priority,
      assignee, start_date, target_date, progress, last_update, description,
      github_branch, jira_link, comment_count, sync_source, progress_auto, created_at, updated_at
    ) values (
      ${task.id}, ${userId}, ${task.ticketId}, ${task.parentId}, ${task.type},
      ${task.name}, ${task.status}, ${task.priority}, ${task.assignee},
      ${task.startDate}, ${task.targetDate}, ${task.progress}, ${task.lastUpdate},
      ${task.description}, ${task.githubBranch}, ${task.jiraLink},
      ${task.commentCount}, ${task.syncSource}, ${task.progressAuto !== false},
      ${task.createdAt}, ${task.updatedAt}
    )
    returning *
  `;

  return Response.json(rowToTask(row), { status: 201 });
}

import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function POST(request) {
  const { userId } = await auth();
  const payload = await request.json();
  const sql = getSql();

  const [existing] = await sql`select 1 from board_config where user_id = ${userId}`;
  if (existing) {
    return Response.json(
      { error: "This account has already been synced; import is only offered once." },
      { status: 409 }
    );
  }

  const config = payload.config || {};
  const tasks = payload.tasks || [];
  const comments = payload.comments || [];

  const queries = [
    sql`
      insert into board_config (
        user_id, statuses, priorities, types, assignees, created_at
      )
      values (
        ${userId}, ${JSON.stringify(config.statuses || [])}::jsonb,
        ${JSON.stringify(config.priorities || [])}::jsonb,
        ${JSON.stringify(config.types || [])}::jsonb,
        ${JSON.stringify(config.assignees || [])}::jsonb,
        ${new Date().toISOString()}
      )
    `,
    ...tasks.map(
      (task) => sql`
        insert into tasks (
          id, user_id, ticket_id, parent_id, type, name, status, priority,
          assignee, start_date, target_date, progress, last_update, description,
          github_branch, jira_link, comment_count, sync_source, created_at, updated_at
        ) values (
          ${task.id}, ${userId}, ${task.ticketId}, ${task.parentId || null}, ${task.type},
          ${task.name}, ${task.status}, ${task.priority}, ${task.assignee},
          ${task.startDate || null}, ${task.targetDate || null}, ${task.progress || 0},
          ${task.lastUpdate || null}, ${task.description || ""}, ${task.githubBranch || "N/A"},
          ${task.jiraLink || null}, ${task.commentCount || 0}, ${task.syncSource || "Manual"},
          ${task.createdAt}, ${task.updatedAt}
        )
      `
    ),
    ...comments.map(
      (comment) => sql`
        insert into comments (
          id, user_id, ticket_id, parent_comment_id, created, updated,
          author, text, jira_issue_link, sync_source
        ) values (
          ${comment.id}, ${userId}, ${comment.ticketId}, ${comment.parentCommentId || null},
          ${comment.created}, ${comment.updated}, ${comment.author}, ${comment.text || ""},
          ${comment.jiraIssueLink || null}, ${comment.syncSource || "Manual"}
        )
      `
    ),
  ];

  await sql.transaction(queries);

  return Response.json({ imported: { tasks: tasks.length, comments: comments.length } });
}

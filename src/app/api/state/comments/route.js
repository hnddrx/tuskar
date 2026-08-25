import { auth } from "@clerk/nextjs/server";
import { getSql, rowToComment } from "@/lib/db";

export async function POST(request) {
  const { userId } = await auth();
  const comment = await request.json();
  const sql = getSql();

  const results = await sql.transaction([
    sql`
      insert into comments (
        id, user_id, ticket_id, parent_comment_id, created, updated,
        author, text, jira_issue_link, sync_source
      ) values (
        ${comment.id}, ${userId}, ${comment.ticketId}, ${comment.parentCommentId},
        ${comment.created}, ${comment.updated}, ${comment.author}, ${comment.text},
        ${comment.jiraIssueLink}, ${comment.syncSource}
      )
      returning *
    `,
    sql`
      update tasks set comment_count = comment_count + 1
      where id = ${comment.ticketId} and user_id = ${userId}
    `,
  ]);

  const row = results[0][0];
  return Response.json(rowToComment(row), { status: 201 });
}

import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamComment, getTeamMembersById } from "@/lib/db";

export async function POST(request) {
  const { userId, orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const comment = await request.json();
  const sql = getSql();

  const results = await sql.transaction([
    sql`
      insert into team_comments (
        id, org_id, ticket_id, parent_comment_id, created, updated,
        author_user_id, text, jira_issue_link, sync_source
      ) values (
        ${comment.id}, ${orgId}, ${comment.ticketId}, ${comment.parentCommentId || null},
        ${comment.created}, ${comment.updated}, ${userId}, ${comment.text || ""},
        ${comment.jiraIssueLink || null}, ${comment.syncSource || "Manual"}
      )
      returning *
    `,
    sql`
      update team_tasks set comment_count = comment_count + 1
      where id = ${comment.ticketId} and org_id = ${orgId}
    `,
  ]);

  const row = results[0][0];
  const membersById = await getTeamMembersById(orgId);
  return Response.json(rowToTeamComment(row, membersById), { status: 201 });
}

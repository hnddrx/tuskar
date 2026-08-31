import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSql, rowToTeamComment, getTeamMembersById, getUserOrgIds } from "@/lib/db";
import { findMentionedIds } from "@/lib/mentions";
import { buildMentionEmail } from "@/lib/mentionEmail";
import { getSmtpConfig, getSmtpConfigForOrg } from "@/lib/smtpCredentials";
import { sendViaSmtp } from "@/lib/smtpTransport";
import { formatSender } from "@/lib/smtp";
import { requireTeamPermission } from "@/lib/teamPermissions";
import { taskMatchesRules } from "@/lib/recordRules";

// The people a comment mentions are worked out here from the comment text and
// the team's real membership — never taken from the request. Whoever controls
// that list controls who gets emailed.
async function resolveMentions(orgId, text, authorUserId) {
  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });

  const members = data
    .map((m) => ({
      id: m.publicUserData?.userId,
      name:
        [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") ||
        m.publicUserData?.identifier ||
        "",
      email: m.publicUserData?.identifier || null,
    }))
    .filter((m) => m.id);

  const ids = findMentionedIds(text, members);
  return {
    ids,
    // Mentioning yourself should not send you mail.
    recipients: ids
      .filter((id) => id !== authorUserId)
      .map((id) => members.find((m) => m.id === id)?.email)
      .filter(Boolean),
  };
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const comment = await request.json();
  const sql = getSql();

  // A comment belongs to whichever team owns the task, which is not always
  // the selected one — you can open a task from any team you are in. Reading
  // the team off the task also means the mention lookup below searches the
  // right membership.
  const [target] = await sql`
    select * from team_tasks where id = ${comment.ticketId}
  `;
  const orgId = target?.org_id;
  const orgIds = await getUserOrgIds(userId);
  if (!orgId || !orgIds.includes(orgId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const gate = await requireTeamPermission(userId, orgId, "comments.create");
  if (gate.error) return gate.error;

  // Commenting on a task the rules hide would both reveal that it exists and
  // leave a comment on a thread its author cannot read.
  if (!taskMatchesRules(target, gate.access.rules, userId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const { ids: mentions, recipients } = await resolveMentions(
    orgId,
    comment.text || "",
    userId
  );

  const results = await sql.transaction([
    sql`
      insert into team_comments (
        id, org_id, ticket_id, parent_comment_id, created, updated,
        author_user_id, text, mentions, jira_issue_link, sync_source
      ) values (
        ${comment.id}, ${orgId}, ${comment.ticketId}, ${comment.parentCommentId || null},
        ${comment.created}, ${comment.updated}, ${userId}, ${comment.text || ""},
        ${JSON.stringify(mentions)}::jsonb,
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

  // Notifying is best-effort: a mail problem must not lose the comment that
  // was already written.
  if (recipients.length > 0) {
    try {
      await notifyMentioned({
        request,
        sql,
        orgId,
        userId,
        recipients,
        authorName: membersById[userId] || "Someone",
        ticketId: comment.ticketId,
        text: comment.text || "",
      });
    } catch (err) {
      console.warn("Failed to send mention notifications", err);
    }
  }

  return Response.json(rowToTeamComment(row, membersById), { status: 201 });
}

async function notifyMentioned({
  request,
  sql,
  orgId,
  userId,
  recipients,
  authorName,
  ticketId,
  text,
}) {
  // The commenter's own mail server, falling back to the team's.
  const own = await getSmtpConfig(userId);
  const smtp = own.configured ? own : await getSmtpConfigForOrg(orgId);
  if (!smtp) return;

  const [task] = await sql`
    select name, ticket_id from team_tasks where id = ${ticketId} and org_id = ${orgId}
  `;

  const message = buildMentionEmail({
    to: recipients,
    authorName,
    taskName: task?.name || "a task",
    ticketId: task?.ticket_id || null,
    commentText: text,
    taskUrl: new URL(`/team/tasks/${ticketId}`, request.url).toString(),
    from: formatSender(smtp),
  });
  if (!message) return;

  const result = await sendViaSmtp(smtp, message);
  if (!result.ok) console.warn("Mention email rejected", result.error);
}

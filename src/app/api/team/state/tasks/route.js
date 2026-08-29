import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, getTeamMembersById, getUserOrgs } from "@/lib/db";

export async function POST(request) {
  const { userId, orgId: activeOrgId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const task = await request.json();

  // The team is named by the caller, because the page can be showing a team
  // other than the selected one. It is only honoured if you are in it — the
  // selected team is the fallback, not the authority.
  const orgId = task.orgId || activeOrgId;
  if (!orgId) {
    return Response.json({ error: "No team given" }, { status: 400 });
  }
  const orgs = await getUserOrgs(userId);
  const org = orgs.find((o) => o.id === orgId);
  if (!org) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sql = getSql();

  const [row] = await sql`
    insert into team_tasks (
      id, org_id, ticket_id, parent_id, type, name, status, priority, assignee_ids,
      start_date, target_date, progress, last_update, description, github_branch,
      jira_link, comment_count, sync_source, created_by, created_at, updated_at
    ) values (
      ${task.id}, ${orgId}, ${task.ticketId}, ${task.parentId || null}, ${task.type},
      ${task.name}, ${task.status}, ${task.priority}, ${JSON.stringify(task.assigneeIds || [])}::jsonb,
      ${task.startDate || null}, ${task.targetDate || null}, ${task.progress || 0},
      ${task.lastUpdate || null}, ${task.description || ""}, ${task.githubBranch || "N/A"},
      ${task.jiraLink || null}, ${task.commentCount || 0}, ${task.syncSource || "Manual"},
      ${userId}, ${task.createdAt}, ${task.updatedAt}
    )
    returning *
  `;

  const membersById = await getTeamMembersById(orgId);
  return Response.json(rowToTeamTask(row, membersById, { [orgId]: org.name }), { status: 201 });
}

import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, rowToTeamComment, getTeamMembersById } from "@/lib/db";
import seed from "@/data/seed.json";

const DEFAULT_TEAM_CONFIG = {
  statuses: seed.config.statuses,
  priorities: seed.config.priorities,
  types: seed.config.types,
};

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const sql = getSql();
  const membersById = await getTeamMembersById(orgId);

  const [configRow] = await sql`
    select * from team_board_config where org_id = ${orgId}
  `;
  const taskRows = await sql`
    select * from team_tasks where org_id = ${orgId} order by created_at asc
  `;
  const commentRows = await sql`
    select * from team_comments where org_id = ${orgId} order by created asc
  `;

  return Response.json({
    tasks: taskRows.map((r) => rowToTeamTask(r, membersById)),
    comments: commentRows.map((r) => rowToTeamComment(r, membersById)),
    config: configRow
      ? {
          statuses: configRow.statuses,
          priorities: configRow.priorities,
          types: configRow.types,
        }
      : DEFAULT_TEAM_CONFIG,
    hasSynced: Boolean(configRow),
  });
}

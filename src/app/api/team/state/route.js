import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTeamTask, rowToTeamComment, getTeamMembersById } from "@/lib/db";
import { DEFAULT_STATUS_PROGRESS } from "@/lib/progress";
import seed from "@/data/seed.json";

const DEFAULT_TEAM_CONFIG = {
  statuses: seed.config.statuses,
  priorities: seed.config.priorities,
  types: seed.config.types,
  statusProgress: DEFAULT_STATUS_PROGRESS,
};

// See the personal route: an empty map means "never configured", not "every
// status is 0%".
function statusProgressOf(configRow) {
  const stored = configRow?.status_progress;
  return stored && Object.keys(stored).length > 0 ? stored : DEFAULT_STATUS_PROGRESS;
}

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
          statusProgress: statusProgressOf(configRow),
        }
      : DEFAULT_TEAM_CONFIG,
    hasSynced: Boolean(configRow),
  });
}

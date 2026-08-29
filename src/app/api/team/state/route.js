import { auth } from "@clerk/nextjs/server";
import {
  getSql,
  rowToTeamTask,
  rowToTeamComment,
  getUserOrgs,
  getReachableMembers,
} from "@/lib/db";
import { DEFAULT_STATUS_PROGRESS } from "@/lib/progress";
import seed from "@/data/seed.json";

const DEFAULT_TEAM_CONFIG = {
  statuses: seed.config.statuses,
  priorities: seed.config.priorities,
  types: seed.config.types,
  statusProgress: DEFAULT_STATUS_PROGRESS,
};

// An empty map means "never configured", not "every status is 0%".
function statusProgressOf(configRow) {
  const stored = configRow?.status_progress;
  return stored && Object.keys(stored).length > 0 ? stored : DEFAULT_STATUS_PROGRESS;
}

/**
 * Team work across every team the signed-in person belongs to, not just the
 * one currently selected — switching teams should change what you are working
 * *in*, not what you can see.
 *
 * Each task and comment carries the team it belongs to so the UI can tell them
 * apart. Membership is read from Clerk, so a team you have left drops out on
 * its own.
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const orgs = await getUserOrgs(userId);
  const orgIds = orgs.map((o) => o.id);
  const orgNames = Object.fromEntries(orgs.map((o) => [o.id, o.name]));

  if (orgIds.length === 0) {
    return Response.json({
      tasks: [],
      comments: [],
      orgs: [],
      configs: {},
      defaults: DEFAULT_TEAM_CONFIG,
      config: DEFAULT_TEAM_CONFIG,
      hasSynced: false,
    });
  }

  const sql = getSql();
  const { members } = await getReachableMembers(userId);
  const membersById = Object.fromEntries(members.map((m) => [m.id, m.name]));

  const taskRows = await sql`
    select * from team_tasks
    where org_id = any(${orgIds}::text[])
    order by created_at asc
  `;
  const commentRows = await sql`
    select * from team_comments
    where org_id = any(${orgIds}::text[])
    order by created asc
  `;

  // Statuses, priorities and types are per team — they drive that team's
  // board columns and its dropdowns — so every team's set is returned and the
  // page picks the one it is showing.
  const configRows = await sql`
    select * from team_board_config
    where org_id = any(${orgIds}::text[])
  `;
  const configs = Object.fromEntries(
    configRows.map((r) => [
      r.org_id,
      {
        statuses: r.statuses,
        priorities: r.priorities,
        types: r.types,
        statusProgress: statusProgressOf(r),
      },
    ]),
  );
  const activeConfig = orgId ? configs[orgId] : null;

  return Response.json({
    tasks: taskRows.map((r) => rowToTeamTask(r, membersById, orgNames)),
    comments: commentRows.map((r) => rowToTeamComment(r, membersById)),
    orgs,
    configs,
    // What a team that has never been configured starts from.
    defaults: DEFAULT_TEAM_CONFIG,
    config: activeConfig || DEFAULT_TEAM_CONFIG,
    hasSynced: Boolean(activeConfig),
  });
}

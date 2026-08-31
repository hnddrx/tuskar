import { auth } from "@clerk/nextjs/server";
import {
  getSql,
  rowToTeamTask,
  rowToTeamComment,
  getUserOrgs,
  getReachableMembers,
} from "@/lib/db";
import { DEFAULT_STATUS_PROGRESS } from "@/lib/progress";
import { hasPermission } from "@/lib/permissions";
import { getAccessByOrg } from "@/lib/teamPermissions";
import { taskMatchesRules } from "@/lib/recordRules";
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

  // A team whose work this person may not see drops out here rather than
  // being filtered on the client — the payload should not carry it at all.
  const access = await getAccessByOrg(userId);
  const orgs = (await getUserOrgs(userId)).filter((o) =>
    hasPermission(access[o.id]?.permissions, "tasks.view")
  );
  const orgIds = orgs.map((o) => o.id);
  const orgNames = Object.fromEntries(orgs.map((o) => [o.id, o.name]));

  // The permissions in force, per team, so the UI can hide the controls this
  // person cannot use. The routes enforce them regardless — this is for
  // presentation, never for access.
  const permissions = Object.fromEntries(
    orgs.map((o) => [o.id, access[o.id]?.permissions || []])
  );

  // Being an admin is not a permission — it comes from the Clerk role and is
  // what decides who may hand permissions out — so it travels separately.
  const admins = Object.fromEntries(
    orgs.map((o) => [o.id, Boolean(access[o.id]?.isAdmin)])
  );

  if (orgIds.length === 0) {
    return Response.json({
      tasks: [],
      comments: [],
      orgs: [],
      configs: {},
      defaults: DEFAULT_TEAM_CONFIG,
      config: DEFAULT_TEAM_CONFIG,
      permissions: {},
      admins: {},
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
  // Record rules decide which tasks exist for this person at all. Applied
  // here rather than in the query: this is the one feed behind the task list,
  // the board and the detail page, so filtering once covers all three, and one
  // evaluator means the list and the mutation routes cannot disagree.
  const visibleTaskRows = taskRows.filter((row) =>
    taskMatchesRules(row, access[row.org_id]?.rules, userId)
  );
  const visibleTaskIds = new Set(visibleTaskRows.map((row) => row.id));

  const commentRows = await sql`
    select * from team_comments
    where org_id = any(${orgIds}::text[])
    order by created asc
  `;

  // A comment travels with its task rather than being ruled on itself: someone
  // restricted to their own work still reads the whole thread on a task they
  // can see. A comment whose task is hidden goes with it.
  const visibleComments = commentRows.filter((row) => visibleTaskIds.has(row.ticket_id));

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
    tasks: visibleTaskRows.map((r) => rowToTeamTask(r, membersById, orgNames)),
    comments: visibleComments.map((r) => rowToTeamComment(r, membersById)),
    orgs,
    configs,
    // What a team that has never been configured starts from.
    defaults: DEFAULT_TEAM_CONFIG,
    config: activeConfig || DEFAULT_TEAM_CONFIG,
    permissions,
    admins,
    hasSynced: Boolean(activeConfig),
  });
}

import { auth } from "@clerk/nextjs/server";
import { getSql, getUserOrgIds } from "@/lib/db";
import { requireTeamPermission } from "@/lib/teamPermissions";

const ALLOWED_KEYS = ["statuses", "priorities", "types", "statusProgress"];

export async function PUT(request) {
  const { userId, orgId: activeOrgId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { key, values, orgId: bodyOrgId } = await request.json();

  // Columns belong to one team, and the board being edited is not always the
  // selected one. Membership decides, not the switcher.
  const orgId = bodyOrgId || activeOrgId;
  if (!orgId) {
    return Response.json({ error: "No team given" }, { status: 400 });
  }
  const orgIds = await getUserOrgIds(userId);
  if (!orgIds.includes(orgId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Statuses and priorities are the shape of everyone's board, so changing
  // them is its own permission rather than part of editing a task.
  const gate = await requireTeamPermission(userId, orgId, "board.config");
  if (gate.error) return gate.error;

  const sql = getSql();

  if (!ALLOWED_KEYS.includes(key)) {
    return Response.json({ error: "Invalid config key" }, { status: 400 });
  }

  const [existing] = await sql`
    select * from team_board_config where org_id = ${orgId}
  `;
  const base = existing
    ? {
        statuses: existing.statuses,
        priorities: existing.priorities,
        types: existing.types,
        statusProgress: existing.status_progress || {},
      }
    : { statuses: [], priorities: [], types: [], statusProgress: {} };
  const merged = { ...base, [key]: values };

  await sql`
    insert into team_board_config (
      org_id, statuses, priorities, types, status_progress, created_at
    )
    values (
      ${orgId}, ${JSON.stringify(merged.statuses)}::jsonb,
      ${JSON.stringify(merged.priorities)}::jsonb, ${JSON.stringify(merged.types)}::jsonb,
      ${JSON.stringify(merged.statusProgress)}::jsonb,
      ${new Date().toISOString()}
    )
    on conflict (org_id) do update set
      statuses = excluded.statuses,
      priorities = excluded.priorities,
      types = excluded.types,
      status_progress = excluded.status_progress
  `;

  return Response.json({ ok: true });
}

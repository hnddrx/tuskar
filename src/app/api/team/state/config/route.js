import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

const ALLOWED_KEYS = ["statuses", "priorities", "types", "statusProgress"];

export async function PUT(request) {
  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const { key, values } = await request.json();
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
    insert into team_board_config (org_id, statuses, priorities, types, status_progress)
    values (
      ${orgId}, ${JSON.stringify(merged.statuses)}::jsonb,
      ${JSON.stringify(merged.priorities)}::jsonb, ${JSON.stringify(merged.types)}::jsonb,
      ${JSON.stringify(merged.statusProgress)}::jsonb
    )
    on conflict (org_id) do update set
      statuses = excluded.statuses,
      priorities = excluded.priorities,
      types = excluded.types,
      status_progress = excluded.status_progress
  `;

  return Response.json({ ok: true });
}

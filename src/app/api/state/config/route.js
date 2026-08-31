import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

const ALLOWED_KEYS = ["statuses", "priorities", "types", "assignees", "statusProgress"];

// `statusProgress` is the one config key that is not a list: a status name ->
// percent map driving automatic progress, kept in its own column.

export async function PUT(request) {
  const { userId } = await auth();
  const { key, values } = await request.json();
  const sql = getSql();

  if (!ALLOWED_KEYS.includes(key)) {
    return Response.json({ error: "Invalid config key" }, { status: 400 });
  }

  const [existing] = await sql`
    select * from board_config where user_id = ${userId}
  `;
  const base = existing
    ? {
        statuses: existing.statuses,
        priorities: existing.priorities,
        types: existing.types,
        assignees: existing.assignees,
        statusProgress: existing.status_progress || {},
      }
    : {
        statuses: [],
        priorities: [],
        types: [],
        assignees: [],
        statusProgress: {},
      };
  const merged = { ...base, [key]: values };

  await sql`
    insert into board_config (
      user_id, statuses, priorities, types, assignees, status_progress, created_at
    )
    values (
      ${userId}, ${JSON.stringify(merged.statuses)}::jsonb,
      ${JSON.stringify(merged.priorities)}::jsonb,
      ${JSON.stringify(merged.types)}::jsonb,
      ${JSON.stringify(merged.assignees)}::jsonb,
      ${JSON.stringify(merged.statusProgress)}::jsonb,
      ${new Date().toISOString()}
    )
    on conflict (user_id) do update set
      statuses = excluded.statuses,
      priorities = excluded.priorities,
      types = excluded.types,
      assignees = excluded.assignees,
      status_progress = excluded.status_progress
  `;

  return Response.json({ ok: true });
}

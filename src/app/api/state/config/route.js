import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

const ALLOWED_KEYS = ["statuses", "priorities", "types", "assignees"];

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
      }
    : { statuses: [], priorities: [], types: [], assignees: [] };
  const merged = { ...base, [key]: values };

  await sql`
    insert into board_config (user_id, statuses, priorities, types, assignees)
    values (
      ${userId}, ${JSON.stringify(merged.statuses)}::jsonb,
      ${JSON.stringify(merged.priorities)}::jsonb,
      ${JSON.stringify(merged.types)}::jsonb,
      ${JSON.stringify(merged.assignees)}::jsonb
    )
    on conflict (user_id) do update set
      statuses = excluded.statuses,
      priorities = excluded.priorities,
      types = excluded.types,
      assignees = excluded.assignees
  `;

  return Response.json({ ok: true });
}

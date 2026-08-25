import { auth } from "@clerk/nextjs/server";
import { getSql, rowToNote } from "@/lib/db";

export async function GET(_request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const sql = getSql();

  const [row] = await sql`
    select * from notes where id = ${id} and user_id = ${userId}
  `;
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(rowToNote(row));
}

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const patch = await request.json();
  const sql = getSql();

  const [existing] = await sql`
    select * from notes where id = ${id} and user_id = ${userId}
  `;
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const merged = { ...rowToNote(existing), ...patch };

  const [row] = await sql`
    update notes set
      type = ${merged.type},
      title = ${merged.title},
      body = ${merged.body},
      linked_task_id = ${merged.linkedTaskId || null},
      attendees = ${JSON.stringify(merged.attendees || [])}::jsonb,
      agenda = ${JSON.stringify(merged.agenda || [])}::jsonb,
      action_items = ${JSON.stringify(merged.actionItems || [])}::jsonb,
      updated_at = ${merged.updatedAt}
    where id = ${id} and user_id = ${userId}
    returning *
  `;

  return Response.json(rowToNote(row));
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const sql = getSql();

  await sql`delete from notes where id = ${id} and user_id = ${userId}`;

  return Response.json({ ok: true });
}

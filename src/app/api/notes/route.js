import { auth } from "@clerk/nextjs/server";
import { getSql, rowToNote } from "@/lib/db";
import { toPlainText } from "@/lib/richText";

// The plain-text `body` is always derived here rather than trusted from the
// client, so the column search reads can never disagree with the document.
function bodyFor(note) {
  return note.bodyRich ? toPlainText(note.bodyRich) : note.body || "";
}

export async function GET() {
  const { userId } = await auth();
  const sql = getSql();
  const rows = await sql`
    select * from notes where user_id = ${userId} order by created_at desc
  `;
  return Response.json(rows.map(rowToNote));
}

export async function POST(request) {
  const { userId } = await auth();
  const note = await request.json();
  const sql = getSql();

  const [row] = await sql`
    insert into notes (
      id, user_id, type, title, body, body_rich, linked_task_id,
      attendees, agenda, action_items, created_at, updated_at
    ) values (
      ${note.id}, ${userId}, ${note.type}, ${note.title}, ${bodyFor(note)},
      ${note.bodyRich ? JSON.stringify(note.bodyRich) : null}::jsonb,
      ${note.linkedTaskId || null},
      ${JSON.stringify(note.attendees || [])}::jsonb,
      ${JSON.stringify(note.agenda || [])}::jsonb,
      ${JSON.stringify(note.actionItems || [])}::jsonb,
      ${note.createdAt}, ${note.updatedAt}
    )
    returning *
  `;

  return Response.json(rowToNote(row), { status: 201 });
}

import { auth } from "@clerk/nextjs/server";
import { del, get } from "@vercel/blob";
import { getSql, rowToNote } from "@/lib/db";

async function findAttachment(sql, id, attachmentId, userId) {
  const [existing] = await sql`
    select * from notes where id = ${id} and user_id = ${userId}
  `;
  if (!existing) return null;
  const note = rowToNote(existing);
  const attachment = (note.attachments || []).find((a) => a.id === attachmentId);
  if (!attachment) return null;
  return { note, attachment };
}

// Streams a private attachment back only to its owner — never a public,
// guessable Blob URL.
export async function GET(_request, { params }) {
  const { userId } = await auth();
  const { id, attachmentId } = await params;
  const sql = getSql();

  const found = await findAttachment(sql, id, attachmentId, userId);
  if (!found) {
    return new Response("Not found", { status: 404 });
  }

  const result = await get(found.attachment.pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": found.attachment.contentType,
      "Content-Disposition": `inline; filename="${found.attachment.filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id, attachmentId } = await params;
  const sql = getSql();

  const found = await findAttachment(sql, id, attachmentId, userId);
  if (!found) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await del(found.attachment.pathname).catch(() => {});

  const attachments = found.note.attachments.filter((a) => a.id !== attachmentId);
  const [row] = await sql`
    update notes set attachments = ${JSON.stringify(attachments)}::jsonb
    where id = ${id} and user_id = ${userId}
    returning *
  `;

  return Response.json(rowToNote(row));
}

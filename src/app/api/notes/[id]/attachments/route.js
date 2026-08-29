import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { getSql, rowToNote } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";
import { classifyAttachment, MAX_ATTACHMENT_SIZE } from "@/lib/attachments";

export async function POST(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const sql = getSql();

  const [existing] = await sql`
    select * from notes where id = ${id} and user_id = ${userId}
  `;
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  // Decided by extension, not by the browser-supplied content type — see
  // lib/attachments.js.
  const classification = classifyAttachment({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (classification.error) {
    return Response.json({ error: classification.error }, { status: 400 });
  }
  const { kind } = classification;

  const contentType = file.type || "application/octet-stream";
  const attachmentId = newId("attachment");
  const safeName = (file.name || kind).replace(/[^\w.\-]/g, "_").slice(-80);
  const pathname = `notes/${userId}/${id}/${attachmentId}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "private",
    contentType,
    maximumSizeInBytes: MAX_ATTACHMENT_SIZE,
  });

  const attachment = {
    id: attachmentId,
    filename: safeName,
    contentType,
    size: file.size,
    kind,
    pathname: blob.pathname,
    createdAt: nowIso(),
  };

  const note = rowToNote(existing);
  const attachments = [...(note.attachments || []), attachment];

  const [row] = await sql`
    update notes set attachments = ${JSON.stringify(attachments)}::jsonb
    where id = ${id} and user_id = ${userId}
    returning *
  `;

  return Response.json(rowToNote(row), { status: 201 });
}

import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { getSql, rowToNote } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

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
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "File is too large (max 20MB)" }, { status: 400 });
  }

  const contentType = file.type || "application/octet-stream";
  const kind = contentType.startsWith("image/")
    ? "image"
    : contentType.startsWith("audio/")
      ? "audio"
      : null;
  if (!kind) {
    return Response.json(
      { error: "Only image or audio files are supported" },
      { status: 400 }
    );
  }

  const attachmentId = newId("attachment");
  const safeName = (file.name || kind).replace(/[^\w.\-]/g, "_").slice(-80);
  const pathname = `notes/${userId}/${id}/${attachmentId}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "private",
    contentType,
    maximumSizeInBytes: MAX_SIZE,
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

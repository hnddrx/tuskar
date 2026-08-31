import { auth } from "@clerk/nextjs/server";
import { del, get } from "@vercel/blob";
import { getSql, rowToNote } from "@/lib/db";
import { dispositionFor } from "@/lib/attachments";
import {
  removeAttachment,
  rowToAttachment,
  syncNoteAttachments,
} from "@/lib/attachmentStore";

/**
 * One attachment, proven to belong to a note this user owns.
 *
 * The join is the ownership check: the attachment must be recorded against
 * this note, and the note must be this user's. Holding an attachment id is
 * never enough on its own.
 */
async function findNoteAttachment(sql, noteId, attachmentId, userId) {
  const [row] = await sql`
    select a.* from attachments a
    join notes n on n.id = a.owner_id
    where a.id = ${attachmentId}
      and a.owner_kind = 'note'
      and a.owner_id = ${noteId}
      and n.user_id = ${userId}
  `;
  return row ? rowToAttachment(row) : null;
}

// Streams a private attachment back only to its owner — never a public,
// guessable Blob URL.
//
// Only the types we render ourselves (images, audio) are served inline. Now
// that arbitrary documents can be attached, anything else is forced to
// download: an uploaded SVG or HTML file served inline would otherwise run
// script on this origin, in the signed-in user's session.
export async function GET(_request, { params }) {
  const { userId } = await auth();
  const { id, attachmentId } = await params;
  const sql = getSql();

  const attachment = await findNoteAttachment(sql, id, attachmentId, userId);
  if (!attachment) {
    return new Response("Not found", { status: 404 });
  }

  const result = await get(attachment.pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": attachment.contentType,
      "Content-Disposition": `${dispositionFor(attachment.kind)}; filename="${attachment.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id, attachmentId } = await params;
  const sql = getSql();

  const attachment = await findNoteAttachment(sql, id, attachmentId, userId);
  if (!attachment) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Unlike the records the Archive holds, an attachment is removed outright:
  // the blob goes, the registry row goes, and the note's projection is rebuilt
  // from what is left.
  await del(attachment.pathname).catch(() => {});
  await removeAttachment(sql, attachmentId);

  const row = await syncNoteAttachments(sql, id, userId);
  return Response.json(rowToNote(row));
}

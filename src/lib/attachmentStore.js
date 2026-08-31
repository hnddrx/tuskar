// The attachments registry — every uploaded file, wherever it was attached.
//
// Files used to exist only as jsonb on the record they hung off: a note's
// `attachments` array, a chat message's `attachment` object. Nothing recorded
// an upload on its own, so there was no way to ask what had been uploaded
// without reading every note and every message.
//
// The `attachments` table is now the source of truth. The jsonb columns are
// kept as a projection of it — rewritten from the table whenever the set
// changes — so note and chat clients keep receiving attachments in the shape
// they already understand, and nothing on the client had to change.

/** The client-facing descriptor. Column names never reach the browser. */
export function rowToAttachment(row) {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    size: Number(row.size) || 0,
    kind: row.kind,
    pathname: row.pathname,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

/**
 * A filename safe to put in a blob path and a Content-Disposition header.
 *
 * Anything outside word characters, dots and hyphens is replaced rather than
 * stripped, so two files cannot collapse onto one name. The tail is kept
 * rather than the head: the extension decides how the file is classified and
 * served, so it is the part that must survive truncation.
 */
export function safeAttachmentName(name, fallback = "file") {
  const cleaned = String(name || fallback).replace(/[^\w.\-]/g, "_").slice(-80);
  return cleaned || fallback;
}

/** Records an upload. Returns the descriptor the caller hands back. */
export async function recordAttachment(sql, attachment) {
  const [row] = await sql`
    insert into attachments (
      id, owner_kind, owner_id, user_id, org_id, uploaded_by,
      filename, content_type, size, kind, pathname, created_at
    ) values (
      ${attachment.id}, ${attachment.ownerKind}, ${attachment.ownerId ?? null},
      ${attachment.userId ?? null}, ${attachment.orgId ?? null}, ${attachment.uploadedBy},
      ${attachment.filename}, ${attachment.contentType}, ${attachment.size},
      ${attachment.kind}, ${attachment.pathname}, ${attachment.createdAt}
    )
    returning *
  `;
  return rowToAttachment(row);
}

/** Everything attached to one record, oldest first — the order it was added. */
export async function listAttachments(sql, ownerKind, ownerId) {
  const rows = await sql`
    select * from attachments
    where owner_kind = ${ownerKind} and owner_id = ${ownerId}
    order by created_at asc
  `;
  return rows.map(rowToAttachment);
}

/**
 * One attachment, with the scope columns the caller needs to prove it is
 * theirs. Ownership is checked by the caller against the record it hangs off,
 * never by trusting the id alone.
 */
export async function findAttachment(sql, id) {
  const [row] = await sql`select * from attachments where id = ${id}`;
  if (!row) return null;
  return { ...rowToAttachment(row), ownerKind: row.owner_kind, ownerId: row.owner_id };
}

export async function removeAttachment(sql, id) {
  await sql`delete from attachments where id = ${id}`;
}

/**
 * Binds a chat upload to the message that finally carried it.
 *
 * Upload and send are separate requests, so a chat attachment exists before
 * the message does and is recorded with no owner. A forward reuses the
 * original file rather than copying it, so the binding names the first
 * message to carry it and later ones leave it alone.
 */
export async function bindAttachment(sql, id, messageId) {
  await sql`
    update attachments set owner_id = ${messageId}
    where id = ${id} and owner_kind = 'chat' and owner_id is null
  `;
}

/**
 * Rewrites a note's `attachments` jsonb from the table and returns the note
 * row. The projection is never edited directly — every change goes to the
 * table first, so the two cannot drift.
 */
export async function syncNoteAttachments(sql, noteId, userId) {
  const list = await listAttachments(sql, "note", noteId);
  const [row] = await sql`
    update notes set attachments = ${JSON.stringify(list)}::jsonb
    where id = ${noteId} and user_id = ${userId}
    returning *
  `;
  return row || null;
}

import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { classifyAttachment, MAX_ATTACHMENT_SIZE } from "@/lib/attachments";
import { getSql } from "@/lib/db";
import { recordAttachment, safeAttachmentName } from "@/lib/attachmentStore";
import { newId, nowIso } from "@/lib/id";

/**
 * Uploads a file for a chat message and returns a descriptor to send with it.
 *
 * Upload and send are separate so a large file can finish transferring while
 * the message is still being typed. The descriptor is meaningless on its own —
 * the blob is private and only ever served back through the message it is
 * attached to, which is where conversation access is checked.
 */
export async function POST(request) {
  const { userId, orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active team" }, { status: 400 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  // Same extension allowlist the note attachments use.
  const classification = classifyAttachment({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (classification.error) {
    return Response.json({ error: classification.error }, { status: 400 });
  }

  const attachmentId = newId("chatfile");
  const safeName = safeAttachmentName(file.name, classification.kind);
  const contentType = file.type || "application/octet-stream";

  const blob = await put(`chat/${orgId}/${attachmentId}-${safeName}`, file, {
    access: "private",
    contentType,
    maximumSizeInBytes: MAX_ATTACHMENT_SIZE,
  });

  // Recorded now, while it belongs to nobody: upload and send are separate
  // requests, so the message that will carry this file does not exist yet. The
  // POST that creates the message binds the two. A file uploaded and never
  // sent stays here with no owner, which is what makes it findable at all.
  const uploadedAt = nowIso();
  const attachment = await recordAttachment(getSql(), {
    id: attachmentId,
    ownerKind: "chat",
    ownerId: null,
    userId: null,
    orgId,
    uploadedBy: userId,
    filename: safeName,
    contentType,
    size: file.size,
    kind: classification.kind,
    pathname: blob.pathname,
    createdAt: uploadedAt,
  });

  return Response.json({ ...attachment, uploadedAt }, { status: 201 });
}

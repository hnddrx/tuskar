import { auth } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import { classifyAttachment, MAX_ATTACHMENT_SIZE } from "@/lib/attachments";
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
  const safeName = (file.name || classification.kind).replace(/[^\w.\-]/g, "_").slice(-80);
  const contentType = file.type || "application/octet-stream";

  const blob = await put(`chat/${orgId}/${attachmentId}-${safeName}`, file, {
    access: "private",
    contentType,
    maximumSizeInBytes: MAX_ATTACHMENT_SIZE,
  });

  return Response.json(
    {
      id: attachmentId,
      filename: safeName,
      contentType,
      size: file.size,
      kind: classification.kind,
      pathname: blob.pathname,
      uploadedBy: userId,
      uploadedAt: nowIso(),
    },
    { status: 201 }
  );
}

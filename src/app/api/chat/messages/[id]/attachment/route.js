import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { getSql, getUserOrgIds } from "@/lib/db";
import { canAccessConversation, isRoomConversation } from "@/lib/chat";
import { dispositionFor } from "@/lib/attachments";

/**
 * Streams a chat attachment back, but only to someone who can see the
 * conversation it was sent in.
 *
 * The blob is private and its path never reaches the browser, so this route is
 * the only way to the file — which is why the conversation check is repeated
 * here rather than assuming whoever holds a message id was allowed to see it.
 */
export async function GET(_request, { params }) {
  const { userId } = await auth();
  if (!userId) return new Response("Not signed in", { status: 401 });

  const { id } = await params;
  const sql = getSql();

  const [row] = await sql`
    select conversation_id, attachment from chat_messages where id = ${id}
  `;
  if (!row?.attachment) return new Response("Not found", { status: 404 });

  const orgIds = isRoomConversation(row.conversation_id) ? await getUserOrgIds(userId) : [];
  if (!canAccessConversation(row.conversation_id, userId, orgIds)) {
    return new Response("Not found", { status: 404 });
  }

  const attachment = row.attachment;
  const result = await get(attachment.pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": attachment.contentType,
      // Anything we do not render ourselves downloads rather than executing on
      // this origin.
      "Content-Disposition": `${dispositionFor(attachment.kind)}; filename="${attachment.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

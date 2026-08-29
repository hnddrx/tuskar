import { auth } from "@clerk/nextjs/server";
import { get } from "@vercel/blob";
import { getSql } from "@/lib/db";
import { canAccessConversation, dmParticipants, isDmConversation } from "@/lib/chat";
import { dispositionFor } from "@/lib/attachments";
import { getTeamMembersById } from "@/lib/db";

/**
 * Streams a chat attachment back, but only to someone who can see the
 * conversation it was sent in.
 *
 * The blob itself is private and its path is never handed to the browser, so
 * this route is the only way to reach the file — which is why the same
 * conversation check the messages route uses is repeated here rather than
 * trusting that whoever has the message id was allowed to see it.
 */
export async function GET(_request, { params }) {
  const { userId, orgId } = await auth();
  if (!orgId) return new Response("No active team", { status: 400 });

  const { id } = await params;
  const sql = getSql();

  const [row] = await sql`
    select conversation_id, attachment from chat_messages
    where id = ${id} and org_id = ${orgId}
  `;
  if (!row?.attachment) return new Response("Not found", { status: 404 });

  if (!canAccessConversation(row.conversation_id, userId)) {
    return new Response("Not found", { status: 404 });
  }
  if (isDmConversation(row.conversation_id)) {
    const membersById = await getTeamMembersById(orgId);
    const allMembers = dmParticipants(row.conversation_id).every((p) => p in membersById);
    if (!allMembers) return new Response("Not found", { status: 404 });
  }

  const attachment = row.attachment;
  const result = await get(attachment.pathname, { access: "private" });
  if (!result || result.statusCode !== 200) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": attachment.contentType,
      // Anything we do not render ourselves downloads rather than executing
      // on this origin.
      "Content-Disposition": `${dispositionFor(attachment.kind)}; filename="${attachment.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

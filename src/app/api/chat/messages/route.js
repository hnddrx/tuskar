import { auth } from "@clerk/nextjs/server";
import { getSql, rowToChatMessage, getTeamMembersById } from "@/lib/db";
import { canAccessConversation, dmParticipants, isDmConversation } from "@/lib/chat";
import { newId, nowIso } from "@/lib/id";

const MAX_BODY = 4000;
const PAGE_SIZE = 200;

/**
 * Whether the caller may use this conversation, checked against their own
 * user id and the team's real membership.
 *
 * A DM id is derived from its participants and therefore guessable, so this
 * runs on every read and every write — the client's word is never taken for
 * who it is or who it may talk to.
 */
async function authorize(conversationId, userId, orgId) {
  if (!canAccessConversation(conversationId, userId)) return false;
  if (!isDmConversation(conversationId)) return true;

  // Both people must still be on this team, so a DM cannot outlive access to
  // the team it belongs to.
  const membersById = await getTeamMembersById(orgId);
  return dmParticipants(conversationId).every((id) => id in membersById);
}

export async function GET(request) {
  const { userId, orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active team" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversation") || "";
  const since = searchParams.get("since");

  if (!(await authorize(conversationId, userId, orgId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sql = getSql();
  // `since` is a cursor, so a poll carries only what is new.
  const rows = since
    ? await sql`
        select * from chat_messages
        where org_id = ${orgId} and conversation_id = ${conversationId}
          and created_at > ${since}
        order by created_at asc limit ${PAGE_SIZE}
      `
    : await sql`
        select * from (
          select * from chat_messages
          where org_id = ${orgId} and conversation_id = ${conversationId}
          order by created_at desc limit ${PAGE_SIZE}
        ) recent order by created_at asc
      `;

  const membersById = await getTeamMembersById(orgId);
  return Response.json(rows.map((r) => rowToChatMessage(r, membersById)));
}

export async function POST(request) {
  const { userId, orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active team" }, { status: 400 });

  const { conversationId, body, attachment } = await request.json();

  if (!(await authorize(conversationId, userId, orgId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const text = String(body || "").trim().slice(0, MAX_BODY);
  // A message may be just a file, but it cannot be nothing at all.
  if (!text && !attachment) {
    return Response.json({ error: "Message is empty" }, { status: 400 });
  }

  const sql = getSql();
  const [row] = await sql`
    insert into chat_messages (
      id, org_id, conversation_id, author_user_id, body, attachment, created_at
    )
    values (
      ${newId("msg")}, ${orgId}, ${conversationId}, ${userId}, ${text},
      ${attachment ? JSON.stringify(attachment) : null}::jsonb, ${nowIso()}
    )
    returning *
  `;

  const membersById = await getTeamMembersById(orgId);
  return Response.json(rowToChatMessage(row, membersById), { status: 201 });
}

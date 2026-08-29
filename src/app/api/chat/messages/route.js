import { auth } from "@clerk/nextjs/server";
import { getSql, rowToChatMessage, getUserOrgIds, getReachableMembers } from "@/lib/db";
import { canAccessConversation, isRoomConversation, roomOrgId } from "@/lib/chat";
import { newId, nowIso } from "@/lib/id";

const MAX_BODY = 4000;
const PAGE_SIZE = 200;

/**
 * Names for the authors in a set of messages.
 *
 * A direct message is no longer tied to a team, so the other person may not be
 * in the team that happens to be selected — names are resolved across every
 * team the caller belongs to.
 */
async function authorNames(userId) {
  const { members } = await getReachableMembers(userId);
  return Object.fromEntries(members.map((m) => [m.id, m.name]));
}

/**
 * Whether the caller may use this conversation.
 *
 * Ids are guessable by construction, so this runs on every read and every
 * write. A room is open to members of the organization it names; a direct
 * message is open to its participants and needs no organization at all, which
 * is what lets a DM keep working on a personal account.
 */
async function authorize(conversationId, userId) {
  const orgIds = isRoomConversation(conversationId) ? await getUserOrgIds(userId) : [];
  return canAccessConversation(conversationId, userId, orgIds);
}

export async function GET(request) {
  const { userId } = await auth();
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversation") || "";
  const since = searchParams.get("since");

  if (!(await authorize(conversationId, userId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sql = getSql();
  // `since` is a cursor, so a poll carries only what is new.
  const rows = since
    ? await sql`
        select * from chat_messages
        where conversation_id = ${conversationId} and created_at > ${since}
        order by created_at asc limit ${PAGE_SIZE}
      `
    : await sql`
        select * from (
          select * from chat_messages
          where conversation_id = ${conversationId}
          order by created_at desc limit ${PAGE_SIZE}
        ) recent order by created_at asc
      `;

  const namesById = await authorNames(userId);
  return Response.json(rows.map((r) => rowToChatMessage(r, namesById)));
}

export async function POST(request) {
  const { userId } = await auth();
  const { conversationId, body, attachment } = await request.json();

  if (!(await authorize(conversationId, userId))) {
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
      ${newId("msg")}, ${roomOrgId(conversationId)}, ${conversationId}, ${userId}, ${text},
      ${attachment ? JSON.stringify(attachment) : null}::jsonb, ${nowIso()}
    )
    returning *
  `;

  const namesById = await authorNames(userId);
  return Response.json(rowToChatMessage(row, namesById), { status: 201 });
}

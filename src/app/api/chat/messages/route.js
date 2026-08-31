import { auth } from "@clerk/nextjs/server";
import { getSql, rowToChatMessage, getUserOrgIds, getReachableMembers } from "@/lib/db";
import { canAccessConversation, isRoomConversation, roomOrgId } from "@/lib/chat";
import { bindAttachment } from "@/lib/attachmentStore";
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

/**
 * The messages these replies are quoting, keyed by id.
 *
 * Fetched in one query rather than per message, and only ever from the same
 * conversation the caller has already been cleared for.
 */
async function quotedById(sql, rows, namesById) {
  const ids = [...new Set(rows.map((r) => r.reply_to_id).filter(Boolean))];
  if (ids.length === 0) return {};

  const parents = await sql`
    select id, author_user_id, body, attachment, deleted_at
    from chat_messages where id = any(${ids}::text[])
  `;
  return Object.fromEntries(
    parents.map((p) => [
      p.id,
      {
        id: p.id,
        authorUserId: p.author_user_id,
        author: namesById[p.author_user_id] || "Unknown",
        body: p.deleted_at ? "" : p.body,
        attachment: p.deleted_at ? null : p.attachment || null,
        deletedAt: p.deleted_at || null,
      },
    ]),
  );
}

function present(rows, namesById, quoted) {
  return rows.map((r) => rowToChatMessage(r, namesById, quoted[r.reply_to_id] || null));
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
  // The cursor is on `updated_at`, not `created_at`, so that an edit or a
  // delete reaches everyone else's screen — neither moves a message's send
  // time, and a cursor on send time would step straight over both.
  const rows = since
    ? await sql`
        select * from chat_messages
        where conversation_id = ${conversationId} and updated_at > ${since}
        order by updated_at asc limit ${PAGE_SIZE}
      `
    : await sql`
        select * from (
          select * from chat_messages
          where conversation_id = ${conversationId}
          order by created_at desc limit ${PAGE_SIZE}
        ) recent order by created_at asc
      `;

  const namesById = await authorNames(userId);
  const quoted = await quotedById(sql, rows, namesById);
  return Response.json(present(rows, namesById, quoted));
}

export async function POST(request) {
  const { userId } = await auth();
  const { conversationId, body, attachment, replyToId, forwardOf } = await request.json();

  if (!(await authorize(conversationId, userId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sql = getSql();
  let text = String(body || "").trim().slice(0, MAX_BODY);
  let file = attachment || null;
  let forwardedFrom = null;

  // Forwarding copies a message you can already see into a conversation you
  // can already write to. The content is taken from the stored row rather than
  // from the request, so a forward cannot be used to put words in someone
  // else's mouth.
  if (forwardOf) {
    const [source] = await sql`
      select conversation_id, body, attachment, deleted_at
      from chat_messages where id = ${forwardOf}
    `;
    if (!source || !(await authorize(source.conversation_id, userId))) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (source.deleted_at) {
      return Response.json({ error: "That message was deleted" }, { status: 400 });
    }
    text = source.body || "";
    file = source.attachment || null;
    forwardedFrom = forwardOf;
  }

  // A reply has to point at something in the same conversation — otherwise a
  // quote could be used to surface a line from a conversation the readers here
  // are not in.
  let replyTo = null;
  if (replyToId) {
    const [parent] = await sql`
      select id from chat_messages
      where id = ${replyToId} and conversation_id = ${conversationId}
    `;
    if (!parent) {
      return Response.json({ error: "Can't reply to that message" }, { status: 400 });
    }
    replyTo = replyToId;
  }

  // A message may be just a file, but it cannot be nothing at all.
  if (!text && !file) {
    return Response.json({ error: "Message is empty" }, { status: 400 });
  }

  const at = nowIso();
  const [row] = await sql`
    insert into chat_messages (
      id, org_id, conversation_id, author_user_id, body, attachment,
      reply_to_id, forwarded_from_id, created_at, updated_at
    )
    values (
      ${newId("msg")}, ${roomOrgId(conversationId)}, ${conversationId}, ${userId}, ${text},
      ${file ? JSON.stringify(file) : null}::jsonb,
      ${replyTo}, ${forwardedFrom}, ${at}, ${at}
    )
    returning *
  `;

  // The file was recorded at upload time with no owner; this is the message
  // that claims it. A forward reuses the original file rather than copying it,
  // so the binding sticks to the first message and later ones leave it alone.
  if (file?.id) {
    await bindAttachment(sql, file.id, row.id);
  }

  const namesById = await authorNames(userId);
  const quoted = await quotedById(sql, [row], namesById);
  return Response.json(present([row], namesById, quoted)[0], { status: 201 });
}

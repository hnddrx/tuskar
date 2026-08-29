import { auth } from "@clerk/nextjs/server";
import { getSql, rowToChatMessage, getUserOrgIds, getReachableMembers } from "@/lib/db";
import { canAccessConversation, isRoomConversation } from "@/lib/chat";
import { nowIso } from "@/lib/id";

const MAX_BODY = 4000;

/**
 * Editing and deleting one message.
 *
 * Both are the author's alone, and both stamp `updated_at` — that stamp is
 * what carries the change to everyone else, because polls ask for "changed
 * since a cursor" and neither an edit nor a delete moves a message's send
 * time.
 */
async function loadOwn(id, userId) {
  const sql = getSql();
  const [row] = await sql`select * from chat_messages where id = ${id}`;
  if (!row) return { error: 404 };

  // Being the author is not enough on its own: someone removed from a team
  // should not still be able to reach back into its room.
  const orgIds = isRoomConversation(row.conversation_id) ? await getUserOrgIds(userId) : [];
  if (!canAccessConversation(row.conversation_id, userId, orgIds)) return { error: 404 };

  // Not "403": whether a message exists is itself something only the people
  // in that conversation should learn.
  if (row.author_user_id !== userId) return { error: 403 };
  if (row.deleted_at) return { error: 410 };

  return { sql, row };
}

async function presented(sql, row, userId) {
  const { members } = await getReachableMembers(userId);
  const namesById = Object.fromEntries(members.map((m) => [m.id, m.name]));

  let quoted = null;
  if (row.reply_to_id) {
    const [parent] = await sql`
      select id, author_user_id, body, attachment, deleted_at
      from chat_messages where id = ${row.reply_to_id}
    `;
    if (parent) {
      quoted = {
        id: parent.id,
        authorUserId: parent.author_user_id,
        author: namesById[parent.author_user_id] || "Unknown",
        body: parent.deleted_at ? "" : parent.body,
        attachment: parent.deleted_at ? null : parent.attachment || null,
        deletedAt: parent.deleted_at || null,
      };
    }
  }
  return rowToChatMessage(row, namesById, quoted);
}

const REFUSALS = {
  403: ["Not yours to change", 403],
  404: ["Not found", 404],
  410: ["That message was deleted", 410],
};

function refuse(code) {
  const [error, status] = REFUSALS[code];
  return Response.json({ error }, { status });
}

export async function PATCH(request, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const { sql, row, error } = await loadOwn(id, userId);
  if (error) return refuse(error);

  const { body } = await request.json();
  const text = String(body || "").trim().slice(0, MAX_BODY);
  // Emptying a message is deleting it, and delete is its own endpoint — this
  // would otherwise leave a message that renders as nothing at all.
  if (!text && !row.attachment) {
    return Response.json({ error: "Message is empty" }, { status: 400 });
  }

  const at = nowIso();
  const [updated] = await sql`
    update chat_messages
    set body = ${text}, edited_at = ${at}, updated_at = ${at}
    where id = ${id}
    returning *
  `;

  return Response.json(await presented(sql, updated, userId));
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const { sql, error } = await loadOwn(id, userId);
  if (error) return refuse(error);

  // A tombstone rather than a removed row: replies that quote this message
  // still have something to point at, and the conversation does not silently
  // reshuffle around a hole.
  //
  // The body and the attachment are cleared here, which is also what revokes
  // the file: the attachment route reads this column to find the blob, so
  // emptying it is what makes the file unreachable.
  const at = nowIso();
  const [updated] = await sql`
    update chat_messages
    set body = '', attachment = null, deleted_at = ${at}, updated_at = ${at}
    where id = ${id}
    returning *
  `;

  return Response.json(await presented(sql, updated, userId));
}

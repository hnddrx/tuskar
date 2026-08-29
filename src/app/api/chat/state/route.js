import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";
import { ROOM_CONVERSATION, dmConversationId, canAccessConversation } from "@/lib/chat";
import { nowIso } from "@/lib/id";

/**
 * Everything the chat sidebar needs: the team's members, and the unread count
 * plus latest activity for each conversation the caller can see.
 *
 * The conversation list is built from the caller's own id, so it can only ever
 * contain the team room and their own DMs — there is no way to ask for
 * someone else's.
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active team" }, { status: 400 });

  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });

  const members = data
    .map((m) => ({
      id: m.publicUserData?.userId,
      name:
        [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") ||
        m.publicUserData?.identifier ||
        "Unknown",
    }))
    .filter((m) => m.id);

  const conversations = [
    { id: ROOM_CONVERSATION, kind: "room" },
    ...members
      .filter((m) => m.id !== userId)
      .map((m) => ({
        id: dmConversationId(userId, m.id),
        kind: "dm",
        withUserId: m.id,
        name: m.name,
      })),
  ];

  const sql = getSql();
  const ids = conversations.map((c) => c.id);

  const reads = await sql`
    select conversation_id, last_read_at from chat_reads
    where user_id = ${userId} and org_id = ${orgId}
      and conversation_id = any(${ids}::text[])
  `;
  const lastReadBy = Object.fromEntries(
    reads.map((r) => [r.conversation_id, r.last_read_at])
  );

  // Unread is counted in the database rather than by shipping every message
  // to the client and counting there.
  const counts = await sql`
    select conversation_id,
           count(*) filter (
             where author_user_id <> ${userId}
               and created_at > coalesce((
                 select last_read_at from chat_reads r
                 where r.user_id = ${userId} and r.org_id = ${orgId}
                   and r.conversation_id = chat_messages.conversation_id
               ), '')
           )::int as unread,
           max(created_at) as last_at
    from chat_messages
    where org_id = ${orgId} and conversation_id = any(${ids}::text[])
    group by conversation_id
  `;
  const statsBy = Object.fromEntries(counts.map((c) => [c.conversation_id, c]));

  return Response.json({
    userId,
    members,
    conversations: conversations.map((c) => ({
      ...c,
      unread: statsBy[c.id]?.unread ?? 0,
      lastAt: statsBy[c.id]?.last_at ?? null,
      lastReadAt: lastReadBy[c.id] ?? null,
    })),
  });
}

/** Marks a conversation read up to now. */
export async function POST(request) {
  const { userId, orgId } = await auth();
  if (!orgId) return Response.json({ error: "No active team" }, { status: 400 });

  const { conversationId } = await request.json();
  if (!canAccessConversation(conversationId, userId)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sql = getSql();
  await sql`
    insert into chat_reads (user_id, org_id, conversation_id, last_read_at)
    values (${userId}, ${orgId}, ${conversationId}, ${nowIso()})
    on conflict (user_id, org_id, conversation_id)
      do update set last_read_at = excluded.last_read_at
  `;

  return Response.json({ ok: true });
}

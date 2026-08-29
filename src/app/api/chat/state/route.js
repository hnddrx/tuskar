import { auth, clerkClient } from "@clerk/nextjs/server";
import { getSql, getReachableMembers } from "@/lib/db";
import { roomConversationId, dmConversationId, canAccessConversation } from "@/lib/chat";
import { nowIso } from "@/lib/id";

/**
 * The chat sidebar: a room for every team you belong to, a direct message with
 * everyone you share a team with, and any DM you already have with someone you
 * no longer do.
 *
 * Deliberately does not require an active team. Direct messages belong to the
 * two people rather than to an organization, so they must keep working when you
 * switch teams or use a personal account.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const clerk = await clerkClient();
  const { orgIds, members } = await getReachableMembers(userId);

  const orgs = await Promise.all(
    orgIds.map(async (id) => {
      try {
        const org = await clerk.organizations.getOrganization({ organizationId: id });
        return { id, name: org.name };
      } catch {
        return { id, name: "Team" };
      }
    })
  );

  const sql = getSql();

  // Reading the sidebar is itself the heartbeat: if you are looking at the app
  // you are present, so there is no separate ping to keep alive.
  const seenAt = nowIso();
  await sql`
    insert into chat_presence (user_id, last_seen_at)
    values (${userId}, ${seenAt})
    on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
  `;

  const conversations = [
    ...orgs.map((o) => ({
      id: roomConversationId(o.id),
      kind: "room",
      name: o.name,
      orgId: o.id,
    })),
    ...members
      .filter((m) => m.id !== userId)
      .map((m) => ({
        id: dmConversationId(userId, m.id),
        kind: "dm",
        withUserId: m.id,
        name: m.name,
        email: m.email,
      })),
  ];

  // DMs already under way with someone outside your teams — reached by email,
  // or a former teammate — so an existing conversation never disappears.
  const existing = await sql`
    select distinct conversation_id from chat_messages
    where conversation_id like 'dm:%' and conversation_id like ${"%" + userId + "%"}
  `;
  const listed = new Set(conversations.map((c) => c.id));
  for (const row of existing) {
    if (listed.has(row.conversation_id)) continue;
    if (!canAccessConversation(row.conversation_id, userId, orgIds)) continue;
    conversations.push({
      id: row.conversation_id,
      kind: "dm",
      withUserId: null,
      name: "Direct message",
    });
  }

  const ids = conversations.map((c) => c.id);

  const presenceRows = await sql`
    select user_id, last_seen_at from chat_presence
    where user_id = any(${members.map((m) => m.id)}::text[])
  `;
  const lastSeenBy = Object.fromEntries(presenceRows.map((r) => [r.user_id, r.last_seen_at]));

  const reads = await sql`
    select conversation_id, last_read_at from chat_reads
    where user_id = ${userId} and conversation_id = any(${ids}::text[])
  `;
  const lastReadBy = Object.fromEntries(reads.map((r) => [r.conversation_id, r.last_read_at]));

  // Unread is counted in the database rather than by shipping every message to
  // the client and counting there.
  const counts = await sql`
    select conversation_id,
           count(*) filter (
             where author_user_id <> ${userId}
               and created_at > coalesce((
                 select last_read_at from chat_reads r
                 where r.user_id = ${userId}
                   and r.conversation_id = chat_messages.conversation_id
               ), '')
           )::int as unread,
           max(created_at) as last_at
    from chat_messages
    where conversation_id = any(${ids}::text[])
    group by conversation_id
  `;
  const statsBy = Object.fromEntries(counts.map((c) => [c.conversation_id, c]));

  return Response.json({
    userId,
    // The server's clock, so a client with a wrong one cannot decide the whole
    // team is offline.
    now: seenAt,
    members: members.map((m) => ({ ...m, lastSeenAt: lastSeenBy[m.id] || null })),
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
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { conversationId } = await request.json();
  const { orgIds } = await getReachableMembers(userId);
  if (!canAccessConversation(conversationId, userId, orgIds)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const sql = getSql();
  await sql`
    insert into chat_reads (user_id, conversation_id, last_read_at)
    values (${userId}, ${conversationId}, ${nowIso()})
    on conflict (user_id, conversation_id)
      do update set last_read_at = excluded.last_read_at
  `;

  return Response.json({ ok: true });
}

// Team chat: conversation identity, access, unread counts and display
// grouping.
//
// A conversation is either the team room or a direct message between two
// people. A DM has no row of its own — its id is derived from the pair, so
// "A messages B" and "B messages A" are the same conversation without a
// lookup. That makes the id guessable, which is exactly why access is a
// function of the requester's own user id and is re-checked on the server for
// every read and write.

const ROOM_PREFIX = "room:";
const DM_PREFIX = "dm:";

/**
 * The id of a team's shared room.
 *
 * It names the organization because ids have to be globally unique: direct
 * messages are not owned by a team, so a conversation id can no longer be
 * read in the context of "the current org". A bare "room" would mean a
 * different conversation to every team.
 */
export function roomConversationId(orgId) {
  return `${ROOM_PREFIX}${orgId}`;
}

export function isRoomConversation(conversationId) {
  return String(conversationId || "").startsWith(ROOM_PREFIX);
}

/** The organization a room belongs to, or null if this is not a room. */
export function roomOrgId(conversationId) {
  if (!isRoomConversation(conversationId)) return null;
  return String(conversationId).slice(ROOM_PREFIX.length) || null;
}

/** The canonical id for a direct message between two people. */
export function dmConversationId(a, b) {
  const ids = [...new Set([a, b].filter(Boolean))].sort();
  return `${DM_PREFIX}${ids.join("|")}`;
}

export function isDmConversation(conversationId) {
  return String(conversationId || "").startsWith(DM_PREFIX);
}

export function dmParticipants(conversationId) {
  if (!isDmConversation(conversationId)) return [];
  return String(conversationId)
    .slice(DM_PREFIX.length)
    .split("|")
    .filter(Boolean);
}

/**
 * Whether `userId` may read and write this conversation.
 *
 * A room is open to members of the organization it names. A direct message is
 * open to its participants and needs no organization at all — which is what
 * lets a DM keep working when you switch teams or use a personal account.
 * Ids are guessable by construction, so this is re-checked on the server for
 * every read and write.
 */
export function canAccessConversation(conversationId, userId, orgIds = []) {
  if (!conversationId || !userId) return false;

  if (isRoomConversation(conversationId)) {
    const orgId = roomOrgId(conversationId);
    return Boolean(orgId) && (orgIds || []).includes(orgId);
  }

  if (!isDmConversation(conversationId)) return false;

  const participants = dmParticipants(conversationId);
  if (participants.length < 1 || participants.length > 2) return false;
  return participants.includes(userId);
}

/** The person on the other end of a DM (yourself, in a note to self). */
export function otherParticipant(conversationId, userId) {
  const participants = dmParticipants(conversationId);
  if (participants.length === 0) return null;
  return participants.find((id) => id !== userId) ?? userId;
}

export function unreadCount(messages, lastReadAt, userId) {
  const since = lastReadAt ? Date.parse(lastReadAt) : 0;
  return (messages || []).filter((m) => {
    if (m.authorUserId === userId) return false;
    const at = Date.parse(m.createdAt);
    return Number.isFinite(at) && at > since;
  }).length;
}

/**
 * Conversations matching what was typed into the chat search — a channel by
 * its team name, or a person by their name or email address.
 *
 * Email is matched as well as name because a chat list shows people by
 * display name, which is the one thing you may not remember about a
 * colleague you have only ever emailed.
 *
 * A blank query means "everything" rather than "nothing", so clearing the box
 * restores the full list instead of emptying it.
 */
export function filterConversations(conversations = [], query = "") {
  const q = query.trim().toLowerCase();
  if (!q) return conversations;
  return conversations.filter((c) => {
    const haystack = [c.name, c.email].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

// Consecutive messages from one person collapse under a single header, the
// way any chat client does it — but only within a short window, so a reply
// hours later still gets its own header and timestamp.
const GROUP_WINDOW_MS = 5 * 60 * 1000;

export function groupMessages(messages) {
  const list = messages || [];
  return list.map((message, i) => {
    const previous = i > 0 ? list[i - 1] : null;
    const at = Date.parse(message.createdAt);
    const previousAt = previous ? Date.parse(previous.createdAt) : null;

    const startsDay =
      !previous ||
      String(message.createdAt).slice(0, 10) !== String(previous.createdAt).slice(0, 10);

    const sameAuthor = previous && previous.authorUserId === message.authorUserId;
    const withinWindow =
      previousAt !== null && Number.isFinite(at) && at - previousAt <= GROUP_WINDOW_MS;

    return { ...message, startsDay, showHeader: startsDay || !sameAuthor || !withinWindow };
  });
}

// Presence is derived from a heartbeat — each client stamps a last-seen time
// while its tab is visible — rather than from a held-open socket. That makes
// it approximate by nature, so the thresholds are deliberately generous: a
// missed beat should not flicker someone offline mid-conversation.
const ONLINE_WINDOW_MS = 90 * 1000;
const AWAY_WINDOW_MS = 5 * 60 * 1000;

export function presenceStatus(lastSeenAt, now) {
  const seen = Date.parse(lastSeenAt);
  const at = Date.parse(now);
  if (!Number.isFinite(seen) || !Number.isFinite(at)) return "offline";

  // A device whose clock runs fast should read as present, not as an error.
  const elapsed = Math.max(0, at - seen);
  if (elapsed <= ONLINE_WINDOW_MS) return "online";
  if (elapsed <= AWAY_WINDOW_MS) return "away";
  return "offline";
}

// ---------------------------------------------------------------------------
// Editing, deleting, replying and forwarding
// ---------------------------------------------------------------------------

/**
 * Only the author can change a message, and a deleted one is final — the
 * server enforces both; this is the same rule so the menu does not offer an
 * action that would be refused.
 */
export function canModifyMessage(message, userId) {
  if (!message || !userId) return false;
  if (message.deletedAt) return false;
  return message.authorUserId === userId;
}

const SNIPPET_LENGTH = 120;

/**
 * The one-line preview shown in a reply quote and in the forward dialog. A
 * message can be a file with no words at all, so it falls back to naming the
 * file rather than rendering as blank.
 */
export function messageSnippet(message) {
  if (!message) return "";
  if (message.deletedAt) return "Message deleted";
  const body = String(message.body || "").replace(/\s+/g, " ").trim();
  if (body) {
    return body.length > SNIPPET_LENGTH ? `${body.slice(0, SNIPPET_LENGTH - 1)}…` : body;
  }
  if (message.attachment) return message.attachment.filename || "Attachment";
  return "";
}

/**
 * Folds a polled batch into the messages already held.
 *
 * The batch is "everything changed since the cursor", not "everything new", so
 * a message that was edited or deleted arrives again and has to replace the
 * copy on screen rather than appear twice. Order is by when a message was
 * sent, which is not the order changes arrive in.
 */
export function mergeMessages(existing, batch) {
  const byId = new Map((existing || []).map((m) => [m.id, m]));
  for (const message of batch || []) {
    if (!message?.id) continue;
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => {
    const at = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    // Two messages in the same millisecond still need a stable order.
    return at !== 0 ? at : String(a.id).localeCompare(String(b.id));
  });
}

/**
 * How far a client has caught up. Tracks the newest *change*, not the newest
 * message, so that an edit to something old is not skipped by the next poll.
 */
export function nextCursor(messages, current = null) {
  let cursor = current;
  for (const message of messages || []) {
    const at = message.updatedAt || message.createdAt;
    if (at && (!cursor || String(at).localeCompare(String(cursor)) > 0)) cursor = at;
  }
  return cursor;
}

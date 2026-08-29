// Team chat: conversation identity, access, unread counts and display
// grouping.
//
// A conversation is either the team room or a direct message between two
// people. A DM has no row of its own — its id is derived from the pair, so
// "A messages B" and "B messages A" are the same conversation without a
// lookup. That makes the id guessable, which is exactly why access is a
// function of the requester's own user id and is re-checked on the server for
// every read and write.

export const ROOM_CONVERSATION = "room";

const DM_PREFIX = "dm:";

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
 * The team room is open to anyone in the team (the caller has already been
 * checked as a member). A DM is open only to its participants — and only to a
 * well-formed pair, so appending yourself to someone else's id cannot let you
 * in.
 */
export function canAccessConversation(conversationId, userId) {
  if (!conversationId || !userId) return false;
  if (conversationId === ROOM_CONVERSATION) return true;
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

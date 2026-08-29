import test from "node:test";
import assert from "node:assert/strict";

import {
  ROOM_CONVERSATION,
  dmConversationId,
  isDmConversation,
  dmParticipants,
  canAccessConversation,
  otherParticipant,
  unreadCount,
  groupMessages,
  presenceStatus,
} from "./chat.js";

// --- conversation ids ------------------------------------------------------

test("the team room has one well-known id", () => {
  assert.equal(ROOM_CONVERSATION, "room");
  assert.equal(isDmConversation(ROOM_CONVERSATION), false);
});

test("a direct message id is the two user ids, sorted", () => {
  assert.equal(dmConversationId("user_b", "user_a"), "dm:user_a|user_b");
});

test("the id is the same whichever way round the pair is given", () => {
  assert.equal(dmConversationId("user_a", "user_b"), dmConversationId("user_b", "user_a"));
});

test("a note to self collapses to a single participant", () => {
  assert.equal(dmConversationId("user_a", "user_a"), "dm:user_a");
});

test("a direct message id is recognised as one", () => {
  assert.equal(isDmConversation("dm:user_a|user_b"), true);
  assert.equal(isDmConversation("something-else"), false);
});

test("participants can be read back out of the id", () => {
  assert.deepEqual(dmParticipants("dm:user_a|user_b"), ["user_a", "user_b"]);
  assert.deepEqual(dmParticipants(ROOM_CONVERSATION), []);
});

// --- access control --------------------------------------------------------

test("anyone on the team can use the team room", () => {
  assert.equal(canAccessConversation(ROOM_CONVERSATION, "user_anyone"), true);
});

test("a participant can access their own direct messages", () => {
  assert.equal(canAccessConversation("dm:user_a|user_b", "user_a"), true);
  assert.equal(canAccessConversation("dm:user_a|user_b", "user_b"), true);
});

test("someone else's direct messages are not accessible by guessing the id", () => {
  assert.equal(canAccessConversation("dm:user_a|user_b", "user_c"), false);
});

test("a malformed conversation id grants no access", () => {
  assert.equal(canAccessConversation("dm:", "user_a"), false);
  assert.equal(canAccessConversation("", "user_a"), false);
  assert.equal(canAccessConversation(null, "user_a"), false);
  assert.equal(canAccessConversation("dm:user_a|user_b", null), false);
});

test("a conversation id cannot be widened by adding participants", () => {
  // Someone appending themselves must not gain access to an existing pair.
  assert.equal(canAccessConversation("dm:user_a|user_b|user_c", "user_c"), false);
});

test("the other person in a direct message is identified", () => {
  assert.equal(otherParticipant("dm:user_a|user_b", "user_a"), "user_b");
  assert.equal(otherParticipant("dm:user_a", "user_a"), "user_a");
  assert.equal(otherParticipant(ROOM_CONVERSATION, "user_a"), null);
});

// --- unread ----------------------------------------------------------------

const msg = (id, authorId, createdAt) => ({ id, authorUserId: authorId, createdAt });

test("messages newer than the last read are unread", () => {
  const messages = [
    msg("1", "user_b", "2026-08-29T10:00:00.000Z"),
    msg("2", "user_b", "2026-08-29T10:05:00.000Z"),
  ];
  assert.equal(unreadCount(messages, "2026-08-29T10:01:00.000Z", "user_a"), 1);
});

test("my own messages are never unread to me", () => {
  const messages = [
    msg("1", "user_a", "2026-08-29T10:05:00.000Z"),
    msg("2", "user_b", "2026-08-29T10:06:00.000Z"),
  ];
  assert.equal(unreadCount(messages, "2026-08-29T10:00:00.000Z", "user_a"), 1);
});

test("never having read a conversation makes everything from others unread", () => {
  const messages = [
    msg("1", "user_b", "2026-08-29T10:00:00.000Z"),
    msg("2", "user_a", "2026-08-29T10:01:00.000Z"),
  ];
  assert.equal(unreadCount(messages, null, "user_a"), 1);
});

test("an empty conversation has nothing unread", () => {
  assert.equal(unreadCount([], null, "user_a"), 0);
});

// --- grouping for display --------------------------------------------------

test("consecutive messages from one person within a few minutes group together", () => {
  const messages = [
    msg("1", "user_a", "2026-08-29T10:00:00.000Z"),
    msg("2", "user_a", "2026-08-29T10:02:00.000Z"),
  ];
  const grouped = groupMessages(messages);
  assert.equal(grouped[0].showHeader, true);
  assert.equal(grouped[1].showHeader, false);
});

test("a different author always starts a new block", () => {
  const messages = [
    msg("1", "user_a", "2026-08-29T10:00:00.000Z"),
    msg("2", "user_b", "2026-08-29T10:00:30.000Z"),
  ];
  assert.equal(groupMessages(messages)[1].showHeader, true);
});

test("a long gap starts a new block even from the same person", () => {
  const messages = [
    msg("1", "user_a", "2026-08-29T10:00:00.000Z"),
    msg("2", "user_a", "2026-08-29T10:30:00.000Z"),
  ];
  assert.equal(groupMessages(messages)[1].showHeader, true);
});

test("the first message of a new day is marked so a date divider can be shown", () => {
  const messages = [
    msg("1", "user_a", "2026-08-28T23:59:00.000Z"),
    msg("2", "user_a", "2026-08-29T00:01:00.000Z"),
  ];
  const grouped = groupMessages(messages);
  assert.equal(grouped[0].startsDay, true);
  assert.equal(grouped[1].startsDay, true);
});

test("grouping nothing yields nothing", () => {
  assert.deepEqual(groupMessages([]), []);
});

// --- presence --------------------------------------------------------------

test("someone seen seconds ago is online", () => {
  const now = "2026-08-29T10:00:00.000Z";
  assert.equal(presenceStatus("2026-08-29T09:59:30.000Z", now), "online");
});

test("someone seen a couple of minutes ago is away", () => {
  const now = "2026-08-29T10:00:00.000Z";
  assert.equal(presenceStatus("2026-08-29T09:58:00.000Z", now), "away");
});

test("someone seen long ago is offline", () => {
  const now = "2026-08-29T10:00:00.000Z";
  assert.equal(presenceStatus("2026-08-29T09:00:00.000Z", now), "offline");
});

test("never having been seen is offline, not online", () => {
  assert.equal(presenceStatus(null, "2026-08-29T10:00:00.000Z"), "offline");
  assert.equal(presenceStatus(undefined, "2026-08-29T10:00:00.000Z"), "offline");
});

test("a nonsense timestamp is offline rather than throwing", () => {
  assert.equal(presenceStatus("not-a-date", "2026-08-29T10:00:00.000Z"), "offline");
});

test("a clock skew putting someone in the future still reads as online", () => {
  const now = "2026-08-29T10:00:00.000Z";
  assert.equal(presenceStatus("2026-08-29T10:00:30.000Z", now), "online");
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  roomConversationId,
  roomOrgId,
  isRoomConversation,
  dmConversationId,
  isDmConversation,
  dmParticipants,
  canAccessConversation,
  otherParticipant,
  unreadCount,
  groupMessages,
  presenceStatus,
  canModifyMessage,
  messageSnippet,
  mergeMessages,
  nextCursor,
} from "./chat.js";

// --- conversation ids ------------------------------------------------------

test("a team room id names its organization, so two teams cannot collide", () => {
  assert.equal(roomConversationId("org_a"), "room:org_a");
  assert.notEqual(roomConversationId("org_a"), roomConversationId("org_b"));
});

test("a room id reports the organization it belongs to", () => {
  assert.equal(roomOrgId("room:org_a"), "org_a");
  assert.equal(roomOrgId("dm:user_a|user_b"), null);
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

test("the two kinds of conversation are told apart", () => {
  assert.equal(isDmConversation("dm:user_a|user_b"), true);
  assert.equal(isDmConversation("room:org_a"), false);
  assert.equal(isRoomConversation("room:org_a"), true);
  assert.equal(isRoomConversation("dm:user_a|user_b"), false);
});

test("participants can be read back out of the id", () => {
  assert.deepEqual(dmParticipants("dm:user_a|user_b"), ["user_a", "user_b"]);
  assert.deepEqual(dmParticipants("room:org_a"), []);
});

// --- access control --------------------------------------------------------

const inOrgA = { userId: "user_a", orgIds: ["org_a"] };

test("a member of the team can use its room", () => {
  assert.equal(canAccessConversation("room:org_a", inOrgA.userId, inOrgA.orgIds), true);
});

test("another team's room is closed even to a signed-in user", () => {
  assert.equal(canAccessConversation("room:org_b", inOrgA.userId, inOrgA.orgIds), false);
});

test("a room is closed to someone in no teams at all", () => {
  assert.equal(canAccessConversation("room:org_a", "user_a", []), false);
});

test("a direct message needs no team at all", () => {
  // This is the point of the change: DMs belong to the two people, so they
  // keep working on a Personal account.
  assert.equal(canAccessConversation("dm:user_a|user_b", "user_a", []), true);
  assert.equal(canAccessConversation("dm:user_a|user_b", "user_b", []), true);
});

test("someone else's direct messages stay closed however many teams you are in", () => {
  assert.equal(canAccessConversation("dm:user_a|user_b", "user_c", ["org_a", "org_b"]), false);
});

test("a malformed conversation id grants no access", () => {
  assert.equal(canAccessConversation("dm:", "user_a", []), false);
  assert.equal(canAccessConversation("room:", "user_a", ["org_a"]), false);
  assert.equal(canAccessConversation("", "user_a", []), false);
  assert.equal(canAccessConversation(null, "user_a", []), false);
  assert.equal(canAccessConversation("dm:user_a|user_b", null, []), false);
});

test("an unprefixed id is not a conversation at all", () => {
  // "room" alone used to be the team room; it must no longer open anything.
  assert.equal(canAccessConversation("room", "user_a", ["org_a"]), false);
});

test("a conversation id cannot be widened by adding participants", () => {
  assert.equal(canAccessConversation("dm:user_a|user_b|user_c", "user_c", []), false);
});

test("the other person in a direct message is identified", () => {
  assert.equal(otherParticipant("dm:user_a|user_b", "user_a"), "user_b");
  assert.equal(otherParticipant("dm:user_a", "user_a"), "user_a");
  assert.equal(otherParticipant("room:org_a", "user_a"), null);
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

test("only the author can change a message, and never a deleted one", () => {
  const mine = { id: "m1", authorUserId: "u1", body: "hi" };
  assert.equal(canModifyMessage(mine, "u1"), true);
  assert.equal(canModifyMessage(mine, "u2"), false);
  assert.equal(canModifyMessage({ ...mine, deletedAt: "2026-01-01" }, "u1"), false);
  assert.equal(canModifyMessage(null, "u1"), false);
  assert.equal(canModifyMessage(mine, null), false);
});

test("a snippet falls back to the filename when a message is only a file", () => {
  assert.equal(messageSnippet({ body: "  hello   there " }), "hello there");
  assert.equal(messageSnippet({ body: "", attachment: { filename: "plan.pdf" } }), "plan.pdf");
  assert.equal(messageSnippet({ body: "x", deletedAt: "2026-01-01" }), "Message deleted");
  assert.equal(messageSnippet({ body: "" }), "");
  assert.equal(messageSnippet(null), "");

  const long = "a".repeat(200);
  const snippet = messageSnippet({ body: long });
  assert.equal(snippet.length, 120);
  assert.ok(snippet.endsWith("…"));
});

test("a polled change replaces the message on screen instead of duplicating it", () => {
  const existing = [
    { id: "m1", createdAt: "2026-01-01T10:00:00Z", body: "first" },
    { id: "m2", createdAt: "2026-01-01T10:01:00Z", body: "second" },
  ];
  // m1 was edited, m3 is new.
  const merged = mergeMessages(existing, [
    { id: "m1", createdAt: "2026-01-01T10:00:00Z", body: "first (fixed)" },
    { id: "m3", createdAt: "2026-01-01T10:02:00Z", body: "third" },
  ]);

  assert.deepEqual(merged.map((m) => m.id), ["m1", "m2", "m3"]);
  assert.equal(merged[0].body, "first (fixed)");
});

test("merging keeps send order, not the order changes arrived in", () => {
  const merged = mergeMessages(
    [{ id: "m2", createdAt: "2026-01-01T10:05:00Z" }],
    [{ id: "m1", createdAt: "2026-01-01T10:00:00Z" }],
  );
  assert.deepEqual(merged.map((m) => m.id), ["m1", "m2"]);
});

test("the cursor tracks the newest change, not the newest message", () => {
  // An old message edited just now must move the cursor, or the next poll
  // would ask for changes after a point that has already passed.
  const messages = [
    { id: "m1", createdAt: "2026-01-01T10:00:00Z", updatedAt: "2026-01-02T09:00:00Z" },
    { id: "m2", createdAt: "2026-01-01T10:05:00Z", updatedAt: "2026-01-01T10:05:00Z" },
  ];
  assert.equal(nextCursor(messages), "2026-01-02T09:00:00Z");
  // A cursor already ahead of the batch is not walked backwards.
  assert.equal(nextCursor(messages, "2026-02-01T00:00:00Z"), "2026-02-01T00:00:00Z");
  assert.equal(nextCursor([], null), null);
});

test("a message with no updatedAt still moves the cursor by its send time", () => {
  assert.equal(
    nextCursor([{ id: "m1", createdAt: "2026-01-01T10:00:00Z" }]),
    "2026-01-01T10:00:00Z",
  );
});

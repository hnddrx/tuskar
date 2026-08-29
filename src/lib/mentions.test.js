import test from "node:test";
import assert from "node:assert/strict";

import {
  activeMentionQuery,
  matchMembers,
  insertMention,
  findMentionedIds,
  splitMentions,
} from "./mentions.js";

const MEMBERS = [
  { id: "user_1", name: "Wren Macayan" },
  { id: "user_2", name: "Sam Rivera" },
  { id: "user_3", name: "Ana" },
];

// --- detecting that the user is typing a mention ---------------------------

test("typing @ opens a mention with an empty query", () => {
  assert.deepEqual(activeMentionQuery("Hey @", 5), { query: "", start: 4 });
});

test("the query is whatever follows the @", () => {
  assert.deepEqual(activeMentionQuery("Hey @wr", 7), { query: "wr", start: 4 });
});

test("a mention can span a space, since names do", () => {
  assert.deepEqual(activeMentionQuery("Hey @Wren Ma", 12), { query: "Wren Ma", start: 4 });
});

test("no @ before the caret means no mention is being typed", () => {
  assert.equal(activeMentionQuery("Hey there", 9), null);
});

test("an email address does not open a mention", () => {
  assert.equal(activeMentionQuery("mail me at sam@example.test", 26), null);
});

test("only the mention before the caret counts, not one earlier in the line", () => {
  assert.deepEqual(activeMentionQuery("@Ana said hi to @Sa", 19), { query: "Sa", start: 16 });
});

test("a mention closed by punctuation is no longer active", () => {
  assert.equal(activeMentionQuery("thanks @Ana, done", 17), null);
});

test("a run of words too long to be a name stops matching", () => {
  const text = "@one two three four five";
  assert.equal(activeMentionQuery(text, text.length), null);
});

// --- filtering the member list --------------------------------------------

test("an empty query offers everyone", () => {
  assert.equal(matchMembers(MEMBERS, "").length, 3);
});

test("matching ignores case and matches anywhere in the name", () => {
  assert.deepEqual(
    matchMembers(MEMBERS, "riv").map((m) => m.id),
    ["user_2"]
  );
});

test("a query matching nobody returns nothing", () => {
  assert.deepEqual(matchMembers(MEMBERS, "zzz"), []);
});

// --- inserting the chosen member ------------------------------------------

test("choosing a member replaces the typed query and adds a trailing space", () => {
  const result = insertMention("Hey @wr", 7, 4, MEMBERS[0]);
  assert.equal(result.text, "Hey @Wren Macayan ");
  assert.equal(result.caret, result.text.length);
});

test("text after the caret is preserved", () => {
  const result = insertMention("Hey @wr can you look", 7, 4, MEMBERS[0]);
  assert.equal(result.text, "Hey @Wren Macayan  can you look");
});

// --- resolving mentions when the comment is saved -------------------------

test("a mentioned member is resolved to their id", () => {
  assert.deepEqual(findMentionedIds("Hey @Wren Macayan look", MEMBERS), ["user_1"]);
});

test("several mentions all resolve", () => {
  const ids = findMentionedIds("@Ana and @Sam Rivera please review", MEMBERS);
  assert.deepEqual(ids.sort(), ["user_2", "user_3"]);
});

test("the same person mentioned twice is only notified once", () => {
  assert.deepEqual(findMentionedIds("@Ana @Ana", MEMBERS), ["user_3"]);
});

test("an @ that matches nobody resolves to nothing", () => {
  assert.deepEqual(findMentionedIds("@Nobody at all", MEMBERS), []);
});

test("the longest matching name wins, so a short name cannot shadow a longer one", () => {
  const members = [
    { id: "user_a", name: "Sam" },
    { id: "user_b", name: "Sam Rivera" },
  ];
  assert.deepEqual(findMentionedIds("@Sam Rivera check this", members), ["user_b"]);
});

// --- rendering -------------------------------------------------------------

test("a comment splits into plain and mention segments", () => {
  const segments = splitMentions("Hey @Ana look", MEMBERS);
  assert.deepEqual(segments, [
    { type: "text", value: "Hey " },
    { type: "mention", value: "@Ana", id: "user_3" },
    { type: "text", value: " look" },
  ]);
});

test("a comment with no mentions is one plain segment", () => {
  assert.deepEqual(splitMentions("nothing here", MEMBERS), [
    { type: "text", value: "nothing here" },
  ]);
});

test("an @ that matches nobody stays plain text", () => {
  assert.deepEqual(splitMentions("@Nobody", MEMBERS), [
    { type: "text", value: "@Nobody" },
  ]);
});

test("empty text produces no segments", () => {
  assert.deepEqual(splitMentions("", MEMBERS), []);
});

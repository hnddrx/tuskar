import test from "node:test";
import assert from "node:assert/strict";

import { buildMentionEmail } from "./mentionEmail.js";

const BASE = {
  to: ["sam@example.test"],
  authorName: "Wren Macayan",
  taskName: "Checkout revamp",
  ticketId: "TAS-001",
  commentText: "Hey @Sam Rivera can you review this?",
  taskUrl: "https://taskarapp.vercel.app/team/tasks/abc",
  from: "Taskar <invites@taskar.test>",
};

const build = (over = {}) => buildMentionEmail({ ...BASE, ...over });

test("it is addressed to the mentioned people", () => {
  assert.deepEqual(build().to, ["sam@example.test"]);
});

test("the subject names who mentioned them and the task", () => {
  const { subject } = build();
  assert.match(subject, /Wren Macayan/);
  assert.match(subject, /Checkout revamp/);
});

test("the body quotes the comment and links to the task", () => {
  const { html } = build();
  assert.match(html, /can you review this/);
  assert.match(html, /https:\/\/taskarapp\.vercel\.app\/team\/tasks\/abc/);
});

test("the ticket id is shown when there is one", () => {
  assert.match(build().html, /TAS-001/);
});

test("a placeholder ticket id is not shown", () => {
  assert.doesNotMatch(build({ ticketId: "N/A" }).html, /N\/A/);
});

test("a comment containing markup cannot inject into the email", () => {
  const { html } = build({ commentText: "<script>alert(1)</script>" });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("a plain-text alternative is included", () => {
  const { text } = build();
  assert.match(text, /Checkout revamp/);
  assert.doesNotMatch(text, /</);
});

test("with nobody to notify there is no message", () => {
  assert.equal(build({ to: [] }), null);
  assert.equal(build({ to: null }), null);
});

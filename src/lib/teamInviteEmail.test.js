import test from "node:test";
import assert from "node:assert/strict";

import { buildTeamInviteEmail, normalizeTimestamp } from "./teamInviteEmail.js";

const BASE = {
  emailAddress: "sam@example.test",
  organizationName: "Development",
  roleName: "Member",
  acceptUrl: "https://clerk.test/accept?__clerk_ticket=abc",
  inviterName: "Wren",
  from: "Taskar <invites@taskar.test>",
  appUrl: "https://taskarapp.vercel.app",
};

const build = (over = {}) => buildTeamInviteEmail({ ...BASE, ...over });

test("it is addressed to the invited person", () => {
  assert.deepEqual(build().to, ["sam@example.test"]);
});

test("the subject names the organization", () => {
  assert.match(build().subject, /Development/);
});

test("the body names the organization, the role and who invited them", () => {
  const { html } = build();
  assert.match(html, /Development/);
  assert.match(html, /Member/);
  assert.match(html, /Wren/);
});

test("the accept link from Clerk is the call to action", () => {
  const { html } = build();
  assert.match(html, /https:\/\/clerk\.test\/accept\?__clerk_ticket=abc/);
});

test("with no accept link it falls back to the app itself", () => {
  const { html } = build({ acceptUrl: null });
  assert.match(html, /https:\/\/taskarapp\.vercel\.app/);
  assert.doesNotMatch(html, /null/);
});

test("a plain-text alternative carries the link too", () => {
  const { text } = build();
  assert.match(text, /https:\/\/clerk\.test\/accept/);
  assert.doesNotMatch(text, /</);
});

test("an expiry date is mentioned when the invitation has one", () => {
  const { html } = build({ expiresAt: Date.parse("2026-09-15T00:00:00.000Z") });
  assert.match(html, /2026-09-15/);
});

test("no expiry is mentioned when the invitation has none", () => {
  assert.doesNotMatch(build({ expiresAt: null }).html, /expires/i);
});

test("an organization name containing markup cannot inject into the email", () => {
  const { html } = build({ organizationName: "<script>alert(1)</script>" });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("a hostile accept link is not turned into a clickable anchor", () => {
  const { html } = build({ acceptUrl: "javascript:alert(1)" });
  assert.doesNotMatch(html, /javascript:/);
});

test("an invitation with no email address produces nothing to send", () => {
  assert.equal(build({ emailAddress: "" }), null);
  assert.equal(build({ emailAddress: null }), null);
});

test("an unnamed organization still reads sensibly", () => {
  const { subject, html } = build({ organizationName: "" });
  assert.match(subject, /team/i);
  assert.doesNotMatch(html, /undefined/);
});

// --- timestamp normalisation -----------------------------------------------

test("a millisecond timestamp is used as-is", () => {
  // Clerk sends JS-style epoch milliseconds.
  const ms = Date.parse("2026-09-15T00:00:00.000Z");
  assert.equal(normalizeTimestamp(ms), ms);
});

test("a second-precision timestamp is scaled up rather than read as 1970", () => {
  const ms = Date.parse("2026-09-15T00:00:00.000Z");
  assert.equal(normalizeTimestamp(Math.floor(ms / 1000)), ms);
});

test("a missing timestamp stays missing", () => {
  assert.equal(normalizeTimestamp(null), null);
  assert.equal(normalizeTimestamp(undefined), null);
  assert.equal(normalizeTimestamp(0), null);
});

test("the expiry shown never lands thousands of years away", () => {
  const seconds = Math.floor(Date.parse("2026-09-15T00:00:00.000Z") / 1000);
  const { html } = build({ expiresAt: normalizeTimestamp(seconds) });
  assert.match(html, /2026-09-15/);
});

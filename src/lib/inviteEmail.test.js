import test from "node:test";
import assert from "node:assert/strict";

import { buildInviteEmail, recipientsOf } from "./inviteEmail.js";

const EVENT = {
  id: "evt_1",
  title: "Sprint review",
  description: "Walk through the checkout revamp",
  location: "Meeting room 2",
  eventDate: "2026-09-03",
  startTime: "14:00",
  endTime: "15:00",
  attendees: [
    { name: "Wren", email: "wren@example.test" },
    { name: "Sam", email: "sam@example.test" },
  ],
};

const ICS = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";

function build(over = {}) {
  return buildInviteEmail({
    event: EVENT,
    ics: ICS,
    from: "Taskar <invites@taskar.test>",
    organizerName: "Wren",
    ...over,
  });
}

// --- recipients ------------------------------------------------------------

test("recipients are the attendees that have an email address", () => {
  const attendees = [
    { name: "Wren", email: "wren@example.test" },
    { name: "No Email" },
    { name: "Sam", email: "sam@example.test" },
  ];
  assert.deepEqual(recipientsOf(attendees), ["wren@example.test", "sam@example.test"]);
});

test("duplicate addresses are only sent to once", () => {
  const attendees = [
    { email: "wren@example.test" },
    { email: "WREN@example.test" },
  ];
  assert.deepEqual(recipientsOf(attendees), ["wren@example.test"]);
});

test("a missing or empty attendee list has no recipients", () => {
  assert.deepEqual(recipientsOf([]), []);
  assert.deepEqual(recipientsOf(null), []);
});

// --- the message -----------------------------------------------------------

test("the subject names the event", () => {
  assert.equal(build().subject, "Invitation: Sprint review");
});

test("it is addressed to every attendee with an email", () => {
  assert.deepEqual(build().to, ["wren@example.test", "sam@example.test"]);
});

test("the body carries the date, time and location", () => {
  const { html } = build();
  assert.match(html, /2026-09-03/);
  assert.match(html, /14:00/);
  assert.match(html, /15:00/);
  assert.match(html, /Meeting room 2/);
});

test("an all-day event says so instead of showing a time", () => {
  const { html } = build({ event: { ...EVENT, startTime: null, endTime: null } });
  assert.match(html, /All day/i);
});

test("a plain-text alternative is included for clients that want one", () => {
  const { text } = build();
  assert.match(text, /Sprint review/);
  assert.match(text, /2026-09-03/);
  assert.doesNotMatch(text, /</);
});

test("the calendar file rides along as an attachment", () => {
  const [attachment] = build().attachments;
  assert.match(attachment.filename, /\.ics$/);
  assert.equal(Buffer.from(attachment.content, "base64").toString("utf8"), ICS);
});

test("the organizer is named in the body", () => {
  assert.match(build().html, /Wren/);
});

test("event details cannot inject markup into the email", () => {
  const { html } = build({
    event: { ...EVENT, title: "<script>alert(1)</script>", location: "<b>x</b>" },
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;script&gt;/);
});

test("a subject with markup is left as plain text, not escaped into it", () => {
  const { subject } = build({ event: { ...EVENT, title: "Q4 <planning>" } });
  assert.equal(subject, "Invitation: Q4 <planning>");
});

test("an event with no attendees produces no message to send", () => {
  assert.equal(build({ event: { ...EVENT, attendees: [] } }), null);
});

test("a link back to the app is included when one is given", () => {
  const { html } = build({ url: "https://taskar.test/calendar" });
  assert.match(html, /https:\/\/taskar\.test\/calendar/);
});

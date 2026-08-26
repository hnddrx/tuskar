// Builds RFC 5545 iCalendar (.ics) payloads for a task, so it can be added
// to any calendar app (Google Calendar, Outlook, Apple Calendar) or sent to
// teammates as a real invite with RSVP-able attendees.

// Escapes a value for an iCalendar text field: backslash, semicolon, comma,
// and newline all carry meaning in the format itself.
function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// RFC 5545 caps a content line at 75 octets; longer lines are folded onto
// continuation lines that begin with a single space.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

// "2026-09-01" -> "20260901" (the DATE value type, for all-day events).
function toDateValue(ymd) {
  return String(ymd).replace(/-/g, "");
}

// DTEND is *exclusive* for all-day events, so a task due on the 1st ends on
// the 2nd — otherwise calendar apps render it as a zero-length event.
function nextDay(ymd) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

function utcStamp() {
  return `${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Builds an .ics payload for a single task.
 *
 * `attendees` are `{ name, email }` — for a team task these are the members
 * it's assigned to. When there's at least one attendee the calendar METHOD
 * becomes REQUEST (a genuine invite that prompts an RSVP); with none it stays
 * PUBLISH (a plain event you're adding to your own calendar).
 */
export function buildTaskInvite({ task, attendees = [], organizer = null, url = null }) {
  const date = task.targetDate || task.startDate;
  if (!date) return null;

  const withEmail = attendees.filter((a) => a?.email);
  const isRequest = withEmail.length > 0;

  const descriptionParts = [];
  if (task.description) descriptionParts.push(task.description);
  descriptionParts.push(`Status: ${task.status}`, `Priority: ${task.priority}`);
  if (task.ticketId && task.ticketId !== "N/A") {
    descriptionParts.push(`Ticket: ${task.ticketId}`);
  }
  if (url) descriptionParts.push(`Open in Taskar: ${url}`);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Taskar//Task Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${isRequest ? "REQUEST" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${task.id}@taskar`,
    `DTSTAMP:${utcStamp()}`,
    `DTSTART;VALUE=DATE:${toDateValue(task.startDate || date)}`,
    `DTEND;VALUE=DATE:${nextDay(date)}`,
    `SUMMARY:${escapeText(task.name)}`,
    `DESCRIPTION:${escapeText(descriptionParts.join("\n"))}`,
    "STATUS:CONFIRMED",
    `SEQUENCE:0`,
  ];

  if (url) lines.push(`URL:${escapeText(url)}`);

  if (organizer?.email) {
    lines.push(
      `ORGANIZER;CN=${escapeText(organizer.name || organizer.email)}:mailto:${organizer.email}`
    );
  }

  for (const a of withEmail) {
    lines.push(
      `ATTENDEE;CN=${escapeText(a.name || a.email)};ROLE=REQ-PARTICIPANT;` +
        `PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n");
}

// "2026-09-01" + "14:30" (in the viewer's own timezone) -> "20260901T063000Z".
// Converting to UTC rather than emitting a floating local time is what makes
// an invite land at the right moment for a recipient in another timezone.
function toUtcDateTime(ymd, hm) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const [hh, mm] = String(hm).split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0);
  return `${dt.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

// Adds `minutes` to a local date+time and returns it as a UTC stamp. Used to
// give an event without an explicit end time a sane default duration.
function addMinutesUtc(ymd, hm, minutes) {
  const [y, m, d] = String(ymd).split("-").map(Number);
  const [hh, mm] = String(hm).split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + minutes, 0);
  return `${dt.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/**
 * Builds an .ics payload for a standalone calendar event (a meeting), as
 * opposed to `buildTaskInvite`'s all-day event derived from a task's due
 * date. An event with a `startTime` becomes a timed VEVENT; without one it
 * falls back to an all-day event.
 */
export function buildEventInvite({ event, organizer = null, url = null }) {
  if (!event?.eventDate) return null;

  const withEmail = (event.attendees || []).filter((a) => a?.email);
  const isRequest = withEmail.length > 0;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Taskar//Task Calendar//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${isRequest ? "REQUEST" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${event.id}@taskar`,
    `DTSTAMP:${utcStamp()}`,
  ];

  if (event.startTime) {
    lines.push(`DTSTART:${toUtcDateTime(event.eventDate, event.startTime)}`);
    lines.push(
      `DTEND:${
        event.endTime
          ? toUtcDateTime(event.eventDate, event.endTime)
          : addMinutesUtc(event.eventDate, event.startTime, 30)
      }`
    );
  } else {
    lines.push(`DTSTART;VALUE=DATE:${toDateValue(event.eventDate)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDay(event.eventDate)}`);
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  lines.push("STATUS:CONFIRMED", "SEQUENCE:0");
  if (url) lines.push(`URL:${escapeText(url)}`);

  if (organizer?.email) {
    lines.push(
      `ORGANIZER;CN=${escapeText(organizer.name || organizer.email)}:mailto:${organizer.email}`
    );
  }
  for (const a of withEmail) {
    lines.push(
      `ATTENDEE;CN=${escapeText(a.name || a.email)};ROLE=REQ-PARTICIPANT;` +
        `PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}

export function downloadIcs(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(href);
}

// Opens the user's mail client with the invite's recipients and details
// pre-filled. The .ics itself can't be attached via mailto:, so the caller
// downloads it alongside this for the user to attach.
export function buildInviteMailto({ task, attendees, url }) {
  const to = attendees.filter((a) => a?.email).map((a) => a.email).join(",");
  const body = [
    `Task: ${task.name}`,
    task.ticketId && task.ticketId !== "N/A" ? `Ticket: ${task.ticketId}` : null,
    `Due: ${task.targetDate || task.startDate}`,
    task.description ? `\n${task.description}` : null,
    url ? `\nOpen in Taskar: ${url}` : null,
    "\nThe calendar invite (.ics) is attached.",
  ]
    .filter(Boolean)
    .join("\n");

  return `mailto:${to}?subject=${encodeURIComponent(
    `Invite: ${task.name}`
  )}&body=${encodeURIComponent(body)}`;
}

export function buildEventMailto({ event, url }) {
  const to = (event.attendees || []).filter((a) => a?.email).map((a) => a.email).join(",");
  const when = event.startTime
    ? `${event.eventDate} at ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
    : `${event.eventDate} (all day)`;
  const body = [
    event.title,
    `When: ${when}`,
    event.location ? `Where: ${event.location}` : null,
    event.description ? `\n${event.description}` : null,
    url ? `\nOpen in Taskar: ${url}` : null,
    "\nThe calendar invite (.ics) is attached.",
  ]
    .filter(Boolean)
    .join("\n");

  return `mailto:${to}?subject=${encodeURIComponent(
    `Invite: ${event.title}`
  )}&body=${encodeURIComponent(body)}`;
}

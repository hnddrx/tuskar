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

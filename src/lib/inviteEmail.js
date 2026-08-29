// Builds the calendar-invite email: recipients, subject, both body parts, and
// the .ics as a real attachment.
//
// Pure, and separate from the sending code, so the message can be tested
// without a network or an API key. The route in api/email/invite hands the
// result straight to Resend.

import { escapeHtml } from "./richText.js";

/** Attendee addresses, de-duplicated case-insensitively, blanks dropped. */
export function recipientsOf(attendees) {
  const seen = new Set();
  const out = [];
  for (const attendee of attendees || []) {
    const email = String(attendee?.email || "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function whenLine(event) {
  if (!event.startTime && !event.endTime) return `${event.eventDate} · All day`;
  const range = [event.startTime, event.endTime].filter(Boolean).join(" – ");
  return `${event.eventDate} · ${range}`;
}

function safeFilename(title) {
  return `${String(title || "invite").replace(/[^a-z0-9-]/gi, "_").slice(0, 60)}.ics`;
}

/**
 * @return the message to send, or null when there is nobody to send it to.
 */
export function buildInviteEmail({ event, ics, from, organizerName, url = null }) {
  const to = recipientsOf(event?.attendees);
  if (to.length === 0) return null;

  const when = whenLine(event);
  const organizer = organizerName || "A Taskar user";

  const textLines = [
    `${organizer} invited you to: ${event.title}`,
    "",
    `When: ${when}`,
  ];
  if (event.location) textLines.push(`Where: ${event.location}`);
  if (event.description) textLines.push("", event.description);
  if (url) textLines.push("", `Open in Taskar: ${url}`);
  textLines.push("", "The invitation is attached as a calendar file.");

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 560px">
      <p style="margin: 0 0 4px; color: #64748b; font-size: 13px">
        ${escapeHtml(organizer)} invited you to
      </p>
      <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600">
        ${escapeHtml(event.title)}
      </h1>
      <table style="border-collapse: collapse; font-size: 14px">
        <tr>
          <td style="padding: 4px 16px 4px 0; color: #64748b; vertical-align: top">When</td>
          <td style="padding: 4px 0">${escapeHtml(when)}</td>
        </tr>
        ${
          event.location
            ? `<tr>
          <td style="padding: 4px 16px 4px 0; color: #64748b; vertical-align: top">Where</td>
          <td style="padding: 4px 0">${escapeHtml(event.location)}</td>
        </tr>`
            : ""
        }
      </table>
      ${
        event.description
          ? `<p style="margin: 16px 0 0; font-size: 14px; white-space: pre-wrap">${escapeHtml(
              event.description
            )}</p>`
          : ""
      }
      ${
        url
          ? `<p style="margin: 20px 0 0; font-size: 14px">
        <a href="${escapeHtml(url)}" style="color: #2563eb">Open in Taskar</a>
      </p>`
          : ""
      }
      <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px">
        The invitation is attached as a calendar file — open it to add this to
        your calendar and RSVP.
      </p>
    </div>
  `.trim();

  return {
    from,
    to,
    subject: `Invitation: ${event.title}`,
    text: textLines.join("\n"),
    html,
    attachments: [
      {
        filename: safeFilename(event.title),
        // Resend takes attachment content as base64.
        content: Buffer.from(ics, "utf8").toString("base64"),
        contentType: "text/calendar; charset=utf-8; method=REQUEST",
      },
    ],
  };
}

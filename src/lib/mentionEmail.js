// The email someone gets when they are @-mentioned in a team comment.
//
// Pure, so the message is testable without a mail server — the sending itself
// happens in the team comments route.

import { escapeHtml } from "./richText.js";

export function buildMentionEmail({
  to,
  authorName,
  taskName,
  ticketId,
  commentText,
  taskUrl,
  from,
}) {
  const recipients = (to || []).filter(Boolean);
  if (recipients.length === 0) return null;

  const author = String(authorName || "Someone").trim();
  const task = String(taskName || "a task").trim();
  // "N/A" is this app's placeholder for an unset ticket id; showing it would
  // read as a real reference.
  const ticket = ticketId && ticketId !== "N/A" ? String(ticketId) : null;
  const body = String(commentText || "").trim();

  const textLines = [
    `${author} mentioned you on ${task}${ticket ? ` (${ticket})` : ""}.`,
    "",
    body,
  ];
  if (taskUrl) textLines.push("", `Open the task: ${taskUrl}`);

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 560px">
      <p style="margin: 0 0 4px; color: #64748b; font-size: 13px">
        ${escapeHtml(author)} mentioned you on
      </p>
      <h1 style="margin: 0 0 16px; font-size: 18px; font-weight: 600">
        ${ticket ? `<span style="color: #64748b; font-weight: 500">${escapeHtml(ticket)}</span> ` : ""}${escapeHtml(task)}
      </h1>
      <blockquote style="margin: 0 0 20px; border-left: 3px solid #cbd5e1; padding-left: 12px; color: #334155; font-size: 14px; white-space: pre-wrap">${escapeHtml(
        body
      )}</blockquote>
      ${
        taskUrl
          ? `<p style="margin: 0">
        <a href="${escapeHtml(taskUrl)}"
           style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 9px 16px; border-radius: 6px; font-size: 14px; font-weight: 500">
          Open the task
        </a>
      </p>`
          : ""
      }
    </div>
  `.trim();

  return {
    from,
    to: recipients,
    subject: `${author} mentioned you on ${task}`,
    text: textLines.join("\n"),
    html,
  };
}

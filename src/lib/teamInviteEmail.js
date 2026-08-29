// The email sent when someone is invited to a team.
//
// Clerk sends its own invitation email; this is the branded replacement, sent
// through the mail server configured in Email Settings so it comes from the
// team rather than from Clerk. Pure and separate from the webhook that
// triggers it, so the message can be tested without a network.

import { escapeHtml } from "./richText.js";

// The accept link is rendered as an anchor, so it must not be able to carry
// a script URL — even though it normally comes from Clerk.
const SAFE_LINK = /^https?:/i;

function safeUrl(candidate, fallback) {
  const url = String(candidate || "");
  if (SAFE_LINK.test(url)) return url;
  return SAFE_LINK.test(String(fallback || "")) ? fallback : null;
}

export function buildTeamInviteEmail({
  emailAddress,
  organizationName,
  roleName,
  acceptUrl,
  inviterName,
  expiresAt = null,
  appUrl = null,
  from,
}) {
  const to = String(emailAddress || "").trim();
  if (!to) return null;

  const team = String(organizationName || "").trim();
  const teamLabel = team || "a team";
  const inviter = String(inviterName || "").trim();
  const role = String(roleName || "").trim();
  const link = safeUrl(acceptUrl, appUrl);
  const expires = expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : null;

  const subject = team
    ? `You've been invited to ${team} on Taskar`
    : "You've been invited to a team on Taskar";

  const textLines = [
    inviter
      ? `${inviter} invited you to join ${teamLabel} on Taskar.`
      : `You've been invited to join ${teamLabel} on Taskar.`,
  ];
  if (role) textLines.push("", `Role: ${role}`);
  if (link) textLines.push("", `Accept the invitation: ${link}`);
  if (expires) textLines.push("", `This invitation expires on ${expires}.`);

  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 560px">
      <p style="margin: 0 0 4px; color: #64748b; font-size: 13px">
        ${inviter ? `${escapeHtml(inviter)} invited you to join` : "You've been invited to join"}
      </p>
      <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 600">
        ${escapeHtml(teamLabel)}
      </h1>
      ${
        role
          ? `<p style="margin: 0 0 16px; font-size: 14px; color: #475569">
        You'll join as <strong>${escapeHtml(role)}</strong>.
      </p>`
          : ""
      }
      ${
        link
          ? `<p style="margin: 0 0 20px">
        <a href="${escapeHtml(link)}"
           style="display: inline-block; background: #0f172a; color: #ffffff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 500">
          Accept invitation
        </a>
      </p>
      <p style="margin: 0 0 16px; font-size: 12px; color: #94a3b8; word-break: break-all">
        Or paste this into your browser: ${escapeHtml(link)}
      </p>`
          : ""
      }
      ${
        expires
          ? `<p style="margin: 0; color: #94a3b8; font-size: 12px">
        This invitation expires on ${escapeHtml(expires)}.
      </p>`
          : ""
      }
    </div>
  `.trim();

  return { from, to: [to], subject, text: textLines.join("\n"), html };
}

// Epoch timestamps arrive in milliseconds from Clerk, but seconds are the
// common convention elsewhere and the difference is not visible in the value's
// shape alone. Anything below ~1973-in-milliseconds is far more plausibly a
// modern timestamp in seconds than a date in 1970, so it is scaled up.
const MILLISECOND_FLOOR = 1e11;

export function normalizeTimestamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number < MILLISECOND_FLOOR ? number * 1000 : number;
}

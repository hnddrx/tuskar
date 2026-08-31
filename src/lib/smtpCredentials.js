// Server-only store for the outgoing mail server, one row per Clerk user in
// the smtp_config table — the same shape as jiraCredentials.js, for the same
// reason: the settings are configured from the UI, and the secret (here the
// SMTP password) is encrypted before it is stored and never travels back to
// the browser.

import { getSql } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/serverCrypto";

const EMPTY = {
  label: "",
  host: "",
  port: 587,
  security: "starttls",
  username: "",
  fromName: "",
  fromEmail: "",
  password: "",
};

function rowToConfig(row) {
  return {
    label: row.label,
    host: row.host,
    port: Number(row.port) || 587,
    security: row.security,
    username: row.username,
    fromName: row.from_name,
    fromEmail: row.from_email,
    password: row.password_enc ? decrypt(row.password_enc) || "" : "",
    updatedAt: row.updated_at,
  };
}

/** Full settings including the decrypted password. Never send this to a client. */
export async function getSmtpConfig(userId) {
  const sql = getSql();
  const [row] = await sql`select * from smtp_config where user_id = ${userId}`;
  if (!row) return { ...EMPTY, configured: false };
  const config = rowToConfig(row);
  return { ...config, configured: Boolean(config.host && config.fromEmail) };
}

/** What the settings screen may see: everything except the password itself. */
export async function getSmtpPublicStatus(userId) {
  const config = await getSmtpConfig(userId);
  return {
    configured: config.configured,
    label: config.label,
    host: config.host,
    port: config.port,
    security: config.security,
    username: config.username,
    fromName: config.fromName,
    fromEmail: config.fromEmail,
    hasPassword: Boolean(config.password),
    updatedAt: config.updatedAt || null,
  };
}

/**
 * Saves the form. `password` is optional: omitted or empty keeps whatever is
 * already stored, so the screen can be edited without retyping the secret.
 */
export async function saveSmtpConfig(userId, input) {
  const sql = getSql();
  const [existing] = await sql`
    select password_enc from smtp_config where user_id = ${userId}
  `;
  const passwordEnc = input.password
    ? encrypt(input.password)
    : existing?.password_enc || null;

  const payload = {
    label: (input.label || "").trim(),
    host: (input.host || "").trim(),
    port: Number(input.port) || 587,
    security: input.security || "starttls",
    username: (input.username || "").trim(),
    fromName: (input.fromName || "").trim(),
    fromEmail: (input.fromEmail || "").trim(),
  };

  await sql`
    insert into smtp_config (
      user_id, label, host, port, security, username,
      password_enc, from_name, from_email, updated_at, created_at
    ) values (
      ${userId}, ${payload.label}, ${payload.host}, ${payload.port},
      ${payload.security}, ${payload.username}, ${passwordEnc},
      ${payload.fromName}, ${payload.fromEmail},
      ${new Date().toISOString()}, ${new Date().toISOString()}
    )
    on conflict (user_id) do update set
      label = excluded.label,
      host = excluded.host,
      port = excluded.port,
      security = excluded.security,
      username = excluded.username,
      password_enc = excluded.password_enc,
      from_name = excluded.from_name,
      from_email = excluded.from_email,
      updated_at = excluded.updated_at
  `;

  return payload;
}

export async function clearSmtpConfig(userId) {
  const sql = getSql();
  await sql`delete from smtp_config where user_id = ${userId}`;
}

export async function hasStoredPassword(userId) {
  const sql = getSql();
  const [row] = await sql`
    select password_enc from smtp_config where user_id = ${userId}
  `;
  return Boolean(row?.password_enc);
}

// Admins first: when a team has several people with a mail server saved, the
// invitation should go out through an admin's rather than an arbitrary
// member's.
function roleRank(role) {
  return String(role || "").includes("admin") ? 0 : 1;
}

/**
 * The mail server to send a team's own email through.
 *
 * A webhook has no signed-in user, but SMTP settings are per person — so the
 * sender is resolved from the organization: its members are read from Clerk,
 * admins first, and the first one with a configured mail server is used.
 * Returns null when nobody in the team has set one up.
 */
export async function getSmtpConfigForOrg(orgId) {
  if (!orgId) return null;

  const { clerkClient } = await import("@clerk/nextjs/server");
  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });

  const candidates = [...data]
    .sort((a, b) => roleRank(a.role) - roleRank(b.role))
    .map((m) => m.publicUserData?.userId)
    .filter(Boolean);
  if (candidates.length === 0) return null;

  const sql = getSql();
  const rows = await sql`
    select user_id from smtp_config
    where user_id = any(${candidates}::text[]) and host <> '' and from_email <> ''
  `;
  const configured = new Set(rows.map((r) => r.user_id));

  const senderId = candidates.find((id) => configured.has(id));
  return senderId ? getSmtpConfig(senderId) : null;
}

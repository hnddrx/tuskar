// Minimal symmetric encryption for values we store in an HttpOnly cookie
// (currently: the Jira API token). Server-only — never imported from a
// "use client" file.
//
// Key material comes from APP_SECRET if set. Without it we still work (so
// configuring Jira from the UI never *requires* an env var), but we derive a
// deterministic fallback key and log a warning once, since that fallback is
// not private the way a real secret is. Setting APP_SECRET is a one-time,
// infra-level thing (like any app's session secret) — not something you
// touch when reconfiguring Jira day to day.

import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
let warned = false;

function getKey() {
  const secret = process.env.APP_SECRET;
  if (!secret && !warned) {
    warned = true;
    console.warn(
      "[taskar] APP_SECRET is not set — Jira credentials will still be " +
        "encrypted at rest, but with a fallback key instead of a real " +
        "secret. Set APP_SECRET in your environment for production use."
    );
  }
  return crypto.createHash("sha256").update(secret || "taskar-fallback-key").digest();
}

export function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decrypt(payload) {
  try {
    const raw = Buffer.from(payload, "base64url");
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

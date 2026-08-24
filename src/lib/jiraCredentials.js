// Server-only store for Jira connection settings, configured from the UI
// instead of environment variables. Everything (including the API token)
// lives in a single HttpOnly cookie — never readable by page JavaScript,
// only ever sent to this app's own server routes. The token itself is
// additionally encrypted before it's written to the cookie (see
// serverCrypto.js).
//
// Env vars (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT) are
// still honored as a fallback for anyone who prefers deploy-time config —
// but the UI path (this file) takes priority and requires no .env changes.

import { cookies } from "next/headers";
import { encrypt, decrypt } from "@/lib/serverCrypto";

const COOKIE_NAME = "taskar_jira";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const EMPTY = {
  baseUrl: "",
  email: "",
  project: "",
  jql: "",
  startDateFieldId: "",
  githubBranchFieldId: "",
};

// Returns the full, decrypted config (including apiToken). Server-only —
// route handlers must never send this object back to the client as-is.
export async function getJiraCredentials() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;

  let fromCookie = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      fromCookie = {
        ...EMPTY,
        ...parsed,
        apiToken: parsed.tokenEnc ? decrypt(parsed.tokenEnc) : "",
      };
    } catch {
      fromCookie = null;
    }
  }

  if (fromCookie && fromCookie.baseUrl && fromCookie.email && fromCookie.apiToken) {
    return { ...fromCookie, source: "ui" };
  }

  // Fall back to env vars if nothing (usable) is saved via the UI yet.
  const envBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  if (envBaseUrl && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) {
    return {
      baseUrl: envBaseUrl,
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
      project: process.env.JIRA_PROJECT || "",
      jql: fromCookie?.jql || "",
      startDateFieldId: fromCookie?.startDateFieldId || "",
      githubBranchFieldId: fromCookie?.githubBranchFieldId || "",
      source: "env",
    };
  }

  return { ...EMPTY, apiToken: "", source: "none" };
}

// Non-secret view safe to return to the client: everything except the
// token, plus whether a token is currently set.
export async function getJiraPublicStatus() {
  const creds = await getJiraCredentials();
  return {
    configured: Boolean(creds.baseUrl && creds.email && creds.apiToken),
    source: creds.source,
    baseUrl: creds.baseUrl || null,
    email: creds.email || null,
    project: creds.project || null,
    jql: creds.jql || null,
    startDateFieldId: creds.startDateFieldId || null,
    githubBranchFieldId: creds.githubBranchFieldId || null,
    hasToken: Boolean(creds.apiToken),
  };
}

// Persists settings from the UI. `apiToken` is optional on update — pass it
// only when the user is setting/changing it; omit to keep the existing one.
export async function saveJiraCredentials(input) {
  const store = await cookies();
  const existingRaw = store.get(COOKIE_NAME)?.value;
  let existingTokenEnc = null;
  if (existingRaw) {
    try {
      existingTokenEnc = JSON.parse(existingRaw).tokenEnc || null;
    } catch {
      existingTokenEnc = null;
    }
  }

  const tokenEnc = input.apiToken ? encrypt(input.apiToken) : existingTokenEnc;

  const payload = {
    baseUrl: (input.baseUrl || "").trim().replace(/\/+$/, ""),
    email: (input.email || "").trim(),
    project: (input.project || "").trim(),
    jql: (input.jql || "").trim(),
    startDateFieldId: (input.startDateFieldId || "").trim(),
    githubBranchFieldId: (input.githubBranchFieldId || "").trim(),
    tokenEnc,
  };

  store.set(COOKIE_NAME, JSON.stringify(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });

  return payload;
}

export async function clearJiraCredentials() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

// Server-only store for Jira connection settings, one row per Clerk user in
// the jira_config table. Everything (including the API token) stays
// server-side; the token is additionally encrypted before it's stored (see
// serverCrypto.js). Env vars (JIRA_BASE_URL / etc.) remain a fallback for
// anyone who prefers deploy-time config over the UI.

import { getSql } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/serverCrypto";

const EMPTY = {
  baseUrl: "",
  email: "",
  project: "",
  jql: "",
  startDateFieldId: "",
  githubBranchFieldId: "",
};

function rowToCreds(row) {
  return {
    baseUrl: row.base_url,
    email: row.email,
    project: row.project,
    jql: row.jql,
    startDateFieldId: row.start_date_field_id,
    githubBranchFieldId: row.github_branch_field_id,
    apiToken: row.api_token_enc ? decrypt(row.api_token_enc) : "",
  };
}

export async function getJiraCredentials(userId) {
  const sql = getSql();
  const [row] = await sql`select * from jira_config where user_id = ${userId}`;
  const fromDb = row ? rowToCreds(row) : null;

  if (fromDb && fromDb.baseUrl && fromDb.email && fromDb.apiToken) {
    return { ...fromDb, source: "ui" };
  }

  const envBaseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, "");
  if (envBaseUrl && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) {
    return {
      baseUrl: envBaseUrl,
      email: process.env.JIRA_EMAIL,
      apiToken: process.env.JIRA_API_TOKEN,
      project: process.env.JIRA_PROJECT || "",
      jql: fromDb?.jql || "",
      startDateFieldId: fromDb?.startDateFieldId || "",
      githubBranchFieldId: fromDb?.githubBranchFieldId || "",
      source: "env",
    };
  }

  return { ...EMPTY, apiToken: "", source: "none" };
}

export async function getJiraPublicStatus(userId) {
  const creds = await getJiraCredentials(userId);
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

export async function saveJiraCredentials(userId, input) {
  const sql = getSql();
  const [existing] = await sql`
    select api_token_enc from jira_config where user_id = ${userId}
  `;
  const tokenEnc = input.apiToken ? encrypt(input.apiToken) : existing?.api_token_enc || null;

  const payload = {
    baseUrl: (input.baseUrl || "").trim().replace(/\/+$/, ""),
    email: (input.email || "").trim(),
    project: (input.project || "").trim(),
    jql: (input.jql || "").trim(),
    startDateFieldId: (input.startDateFieldId || "").trim(),
    githubBranchFieldId: (input.githubBranchFieldId || "").trim(),
  };

  await sql`
    insert into jira_config (
      user_id, base_url, email, project, jql,
      start_date_field_id, github_branch_field_id, api_token_enc
    ) values (
      ${userId}, ${payload.baseUrl}, ${payload.email}, ${payload.project}, ${payload.jql},
      ${payload.startDateFieldId}, ${payload.githubBranchFieldId}, ${tokenEnc}
    )
    on conflict (user_id) do update set
      base_url = excluded.base_url,
      email = excluded.email,
      project = excluded.project,
      jql = excluded.jql,
      start_date_field_id = excluded.start_date_field_id,
      github_branch_field_id = excluded.github_branch_field_id,
      api_token_enc = excluded.api_token_enc
  `;

  return payload;
}

export async function clearJiraCredentials(userId) {
  const sql = getSql();
  await sql`delete from jira_config where user_id = ${userId}`;
}

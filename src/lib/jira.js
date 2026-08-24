// Server-only helper for talking to the Jira Cloud REST API. Only ever
// imported from route.js files (App Router API routes), which run on the
// server — the API token never reaches the browser.
//
// Credentials are passed in explicitly (see jiraCredentials.js) rather than
// read from process.env here, so the same functions work whether the user
// configured Jira from the UI or via environment variables.
//
// Uses POST /rest/api/3/search/jql, the current (non-deprecated) issue
// search endpoint. The older /rest/api/3/search endpoint was removed by
// Atlassian; search/jql uses nextPageToken-based pagination instead of
// startAt.

const DEFAULT_FIELDS = [
  "summary",
  "status",
  "priority",
  "assignee",
  "issuetype",
  "created",
  "updated",
  "duedate",
  "description",
];

function authHeader(email, apiToken) {
  const token = Buffer.from(`${email}:${apiToken}`).toString("base64");
  return `Basic ${token}`;
}

// Atlassian Document Format -> plain text, good enough for a readable
// description without pulling in a full ADF renderer.
export function adfToText(node) {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";

  const childText = (node.content || []).map(adfToText).join("");

  switch (node.type) {
    case "paragraph":
    case "heading":
      return childText + "\n";
    case "listItem":
      return `- ${childText}\n`;
    case "hardBreak":
      return "\n";
    default:
      return childText;
  }
}

// Quick credential check — GET /rest/api/3/myself. Used by "Test connection"
// both before saving (validate what's in the form) and after (re-verify
// what's stored).
export async function testJiraConnection({ baseUrl, email, apiToken }) {
  if (!baseUrl || !email || !apiToken) {
    return { ok: false, error: "Base URL, email, and API token are all required." };
  }
  let res;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}/rest/api/3/myself`, {
      headers: {
        Authorization: authHeader(email, apiToken),
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err.name === "TimeoutError" ? "timed out after 10s" : err.message;
    return { ok: false, error: `Couldn't reach ${baseUrl}: ${reason}` };
  }

  if (res.status === 401) {
    return { ok: false, error: "Invalid email or API token (401 Unauthorized)." };
  }
  if (res.status === 403) {
    return { ok: false, error: "Credentials were accepted but access was denied (403 Forbidden)." };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Jira responded with ${res.status} ${res.statusText}. ${text.slice(0, 200)}` };
  }

  const me = await res.json();
  return {
    ok: true,
    account: {
      name: me.displayName || me.emailAddress || email,
      email: me.emailAddress || email,
      avatarUrl: me.avatarUrls?.["24x24"] || null,
    },
  };
}

export async function searchJiraIssues({
  baseUrl,
  email,
  apiToken,
  jql,
  maxResults = 200,
  extraFieldIds = [],
}) {
  if (!baseUrl || !email || !apiToken) {
    const err = new Error(
      "Jira is not configured. Add your Jira Base URL, email, and API token in Jira Settings."
    );
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const fields = [...DEFAULT_FIELDS, ...extraFieldIds.filter(Boolean)];
  const issues = [];
  let nextPageToken;
  const perPage = 100;
  let pages = 0;
  const maxPages = 10; // safety cap for a personal tracker

  do {
    const res = await fetch(`${baseUrl}/rest/api/3/search/jql`, {
      method: "POST",
      headers: {
        Authorization: authHeader(email, apiToken),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        jql,
        maxResults: Math.min(perPage, maxResults - issues.length),
        fields,
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(
        `Jira API request failed (${res.status} ${res.statusText}): ${text.slice(
          0,
          300
        )}`
      );
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    issues.push(...(data.issues || []));
    nextPageToken = data.nextPageToken || null;
    pages += 1;
  } while (nextPageToken && issues.length < maxResults && pages < maxPages);

  return { issues, baseUrl };
}

export function mapJiraIssue(issue, baseUrl, { startDateFieldId, githubBranchFieldId } = {}) {
  const f = issue.fields || {};
  return {
    ticketId: issue.key,
    name: f.summary || "(no summary)",
    status: f.status?.name || "Not Started",
    priority: f.priority?.name || null,
    assignee: f.assignee?.displayName || null,
    type: f.issuetype?.name || "Task",
    startDate: startDateFieldId ? normalizeDate(f[startDateFieldId]) : null,
    targetDate: normalizeDate(f.duedate),
    description: adfToText(f.description).trim(),
    jiraLink: `${baseUrl}/browse/${issue.key}`,
    githubBranch: githubBranchFieldId ? f[githubBranchFieldId] || null : null,
  };
}

function normalizeDate(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}

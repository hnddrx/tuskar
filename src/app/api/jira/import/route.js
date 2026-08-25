import { auth } from "@clerk/nextjs/server";
import { searchJiraIssues, mapJiraIssue } from "@/lib/jira";
import { getJiraCredentials } from "@/lib/jiraCredentials";

// One-way import: pulls issues from Jira via JQL and returns them mapped to
// our task shape. The client merges them into local state (see
// TaskContext.mergeJiraIssues) — this route never writes anything back to
// Jira, and nothing here is persisted server-side except the connection
// settings themselves (see /api/jira/config).
export async function POST(request) {
  const { userId } = await auth();
  let body = {};
  try {
    body = await request.json();
  } catch {
    // no body provided, use stored defaults
  }

  const creds = await getJiraCredentials(userId);
  const explicitJql = (body.jql ?? creds.jql)?.trim();
  const jql =
    explicitJql ||
    (creds.project ? `project = "${creds.project}" ORDER BY updated DESC` : "");
  if (!jql) {
    return Response.json(
      {
        error:
          "Add a JQL query or a Jira Project in Jira Settings before importing.",
      },
      { status: 400 }
    );
  }

  const startDateFieldId = body.startDateFieldId ?? creds.startDateFieldId;
  const githubBranchFieldId = body.githubBranchFieldId ?? creds.githubBranchFieldId;

  try {
    const { issues, baseUrl } = await searchJiraIssues({
      baseUrl: creds.baseUrl,
      email: creds.email,
      apiToken: creds.apiToken,
      jql,
      maxResults: body.maxResults || 200,
      extraFieldIds: [startDateFieldId, githubBranchFieldId].filter(Boolean),
    });

    const mapped = issues.map((issue) =>
      mapJiraIssue(issue, baseUrl, { startDateFieldId, githubBranchFieldId })
    );

    return Response.json({
      issues: mapped,
      count: mapped.length,
      jql,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const status = err.code === "NOT_CONFIGURED" ? 400 : err.status || 500;
    return Response.json({ error: err.message }, { status });
  }
}

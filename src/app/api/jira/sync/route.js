import { searchJiraIssues, mapJiraIssue } from "@/lib/jira";

// One-way pull: fetches issues from Jira via JQL and returns them mapped to
// our task shape. The client is responsible for merging them into local
// state (see TaskContext.mergeJiraIssues) — this route never writes
// anything back to Jira.
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // no body provided, use defaults
  }

  const jql = body.jql?.trim();
  if (!jql) {
    return Response.json({ error: "A JQL query is required." }, { status: 400 });
  }

  try {
    const { issues, baseUrl } = await searchJiraIssues({
      jql,
      maxResults: body.maxResults || 200,
      extraFieldIds: [body.startDateFieldId, body.githubBranchFieldId].filter(
        Boolean
      ),
    });

    const mapped = issues.map((issue) =>
      mapJiraIssue(issue, baseUrl, {
        startDateFieldId: body.startDateFieldId,
        githubBranchFieldId: body.githubBranchFieldId,
      })
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

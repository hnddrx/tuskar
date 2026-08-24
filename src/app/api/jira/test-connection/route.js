import { testJiraConnection } from "@/lib/jira";
import { getJiraCredentials } from "@/lib/jiraCredentials";

// Validates Jira credentials via GET /rest/api/3/myself. If the request body
// includes baseUrl/email/apiToken, those unsaved form values are tested
// directly (so a user can check before saving). Otherwise, whatever is
// currently stored (UI-saved cookie, or env var fallback) is tested.
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // no body — fall through to stored credentials
  }

  let creds;
  if (body.baseUrl || body.email || body.apiToken) {
    const stored = body.apiToken ? null : await getJiraCredentials();
    creds = {
      baseUrl: body.baseUrl?.trim(),
      email: body.email?.trim(),
      apiToken: body.apiToken || stored?.apiToken,
    };
  } else {
    creds = await getJiraCredentials();
  }

  const result = await testJiraConnection(creds);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}

import { getJiraPublicStatus } from "@/lib/jiraCredentials";

// Reports whether Jira is configured (via the UI or env vars), without ever
// exposing the token.
export async function GET() {
  const { configured, baseUrl, email } = await getJiraPublicStatus();
  return Response.json({
    configured,
    baseUrl: configured ? baseUrl : null,
    email: configured ? maskEmail(email) : null,
  });
}

function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const maskedUser = user.length <= 2 ? user[0] + "*" : user[0] + "*".repeat(user.length - 2) + user.slice(-1);
  return `${maskedUser}@${domain}`;
}

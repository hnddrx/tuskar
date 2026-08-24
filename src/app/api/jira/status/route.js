import { getJiraEnvConfig } from "@/lib/jira";

// Reports whether Jira env vars are set, without ever exposing the token.
export async function GET() {
  const { configured, baseUrl, email } = getJiraEnvConfig();
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

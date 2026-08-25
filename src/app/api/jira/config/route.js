import { auth } from "@clerk/nextjs/server";
import {
  getJiraPublicStatus,
  saveJiraCredentials,
  clearJiraCredentials,
} from "@/lib/jiraCredentials";

// Everything needed to render the Jira Settings screen — never includes the
// API token itself, only whether one is set (hasToken).
export async function GET() {
  const { userId } = await auth();
  const status = await getJiraPublicStatus(userId);
  return Response.json(status);
}

// Saves connection settings from the UI. apiToken is optional: omit it (or
// send an empty string) to keep whatever token is already stored while
// updating other fields.
export async function POST(request) {
  const { userId } = await auth();
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.baseUrl?.trim() || !body.email?.trim()) {
    return Response.json(
      { error: "Jira Base URL and email are required." },
      { status: 400 }
    );
  }

  await saveJiraCredentials(userId, body);
  const status = await getJiraPublicStatus(userId);
  return Response.json(status);
}

export async function DELETE() {
  const { userId } = await auth();
  await clearJiraCredentials(userId);
  const status = await getJiraPublicStatus(userId);
  return Response.json(status);
}

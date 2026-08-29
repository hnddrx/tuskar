import { auth } from "@clerk/nextjs/server";
import {
  getSmtpPublicStatus,
  saveSmtpConfig,
  clearSmtpConfig,
  hasStoredPassword,
} from "@/lib/smtpCredentials";
import { validateSmtpConfig } from "@/lib/smtp";

// Everything the settings screen needs — never the password itself, only
// whether one is stored (hasPassword).
export async function GET() {
  const { userId } = await auth();
  return Response.json(await getSmtpPublicStatus(userId));
}

export async function POST(request) {
  const { userId } = await auth();
  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // An existing password lets the form be saved with the field left blank.
  const stored = await hasStoredPassword(userId);
  const errors = validateSmtpConfig(body, { hasStoredPassword: stored });
  if (errors.length > 0) {
    return Response.json({ error: errors.join(" ") }, { status: 400 });
  }

  await saveSmtpConfig(userId, body);
  return Response.json(await getSmtpPublicStatus(userId));
}

export async function DELETE() {
  const { userId } = await auth();
  await clearSmtpConfig(userId);
  return Response.json(await getSmtpPublicStatus(userId));
}

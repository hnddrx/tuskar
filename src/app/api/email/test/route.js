import { auth } from "@clerk/nextjs/server";
import { getSmtpConfig } from "@/lib/smtpCredentials";
import { testSmtpConnection } from "@/lib/smtpTransport";

/**
 * Opens and authenticates an SMTP connection without sending anything.
 *
 * Unsaved form values in the body are tested as-is, so the settings screen
 * can check a change before committing it. A blank password falls back to
 * whatever is already stored, which is what lets the field stay empty when
 * only the host or port is being adjusted.
 */
export async function POST(request) {
  const { userId } = await auth();
  let body = {};
  try {
    body = await request.json();
  } catch {
    // No body — test whatever is saved.
  }

  const stored = await getSmtpConfig(userId);
  const config = body.host
    ? {
        host: body.host,
        port: body.port,
        security: body.security,
        username: body.username,
        password: body.password || stored.password,
        fromName: body.fromName,
        fromEmail: body.fromEmail,
      }
    : stored;

  if (!config.host) {
    return Response.json(
      { ok: false, error: "Fill in the SMTP server first." },
      { status: 400 }
    );
  }

  const result = await testSmtpConnection(config);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}

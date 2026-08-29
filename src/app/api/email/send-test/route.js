import { auth, currentUser } from "@clerk/nextjs/server";
import { getSmtpConfig } from "@/lib/smtpCredentials";
import { sendViaSmtp } from "@/lib/smtpTransport";

/**
 * Sends one test message to prove the settings really deliver — `verify()`
 * only proves the server accepted a login.
 *
 * The recipient is always the signed-in user's own Clerk address and is never
 * taken from the request, so this button cannot be used to send mail to
 * anyone else.
 */
export async function POST() {
  const { userId } = await auth();
  const config = await getSmtpConfig(userId);

  if (!config.configured) {
    return Response.json(
      { ok: false, error: "Save your mail server settings first." },
      { status: 400 }
    );
  }

  const user = await currentUser();
  const to = user?.emailAddresses?.[0]?.emailAddress;
  if (!to) {
    return Response.json(
      { ok: false, error: "Your account has no email address to send a test to." },
      { status: 400 }
    );
  }

  const result = await sendViaSmtp(config, {
    to,
    subject: "Taskar test email",
    text: [
      "This is a test message from Taskar.",
      "",
      `Sent through ${config.host}:${config.port} (${config.security}).`,
      "If you're reading this, outgoing email is working.",
    ].join("\n"),
    html: `
      <div style="font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.6">
        <h1 style="font-size: 18px; margin: 0 0 8px">Taskar test email</h1>
        <p style="margin: 0 0 12px">If you're reading this, outgoing email is working.</p>
        <p style="margin: 0; color: #64748b; font-size: 13px">
          Sent through ${config.host}:${config.port} (${config.security}).
        </p>
      </div>
    `.trim(),
  });

  if (!result.ok) {
    return Response.json(result, { status: 400 });
  }
  return Response.json({ ok: true, message: `Test email sent to ${to}.` });
}

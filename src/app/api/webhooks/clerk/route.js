import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { getSmtpConfigForOrg } from "@/lib/smtpCredentials";
import { sendViaSmtp } from "@/lib/smtpTransport";
import { formatSender } from "@/lib/smtp";
import { buildTeamInviteEmail, normalizeTimestamp } from "@/lib/teamInviteEmail";

/**
 * Clerk webhooks.
 *
 * Currently one event: when someone is invited to a team, send our own
 * branded invitation through the team's configured mail server rather than
 * leaving it to Clerk's generic email.
 *
 * The signature is always verified — an unverified endpoint would let anyone
 * make this app send mail to any address.
 */
export async function POST(request) {
  let event;
  try {
    // Reads CLERK_WEBHOOK_SIGNING_SECRET itself and throws on a bad signature.
    event = await verifyWebhook(request);
  } catch (err) {
    console.warn("Clerk webhook verification failed", err);
    return new Response("Verification failed", { status: 400 });
  }

  if (event.type !== "organizationInvitation.created") {
    // Acknowledge everything else so Clerk doesn't retry events we ignore.
    return new Response("Ignored", { status: 200 });
  }

  const invitation = event.data;
  const orgId = invitation.organization_id;

  const smtp = await getSmtpConfigForOrg(orgId);
  if (!smtp) {
    // Nobody on the team has a mail server configured. Clerk still sends its
    // own invitation, so the invite is not lost — there is simply nothing for
    // us to send, and no amount of retrying will change that.
    console.warn(`No mail server configured for org ${orgId}; skipping branded invite`);
    return new Response("No sender configured", { status: 200 });
  }

  const message = buildTeamInviteEmail({
    emailAddress: invitation.email_address,
    organizationName: invitation.public_organization_data?.name || "",
    roleName: invitation.role_name || "",
    acceptUrl: invitation.url,
    expiresAt: normalizeTimestamp(invitation.expires_at),
    appUrl: new URL("/", request.url).toString(),
    from: formatSender(smtp),
  });
  if (!message) {
    return new Response("Nothing to send", { status: 200 });
  }

  const result = await sendViaSmtp(smtp, message);
  if (!result.ok) {
    console.warn("Failed to send team invitation email", result.error);
    // A 5xx tells Clerk to retry — the failure may well be transient.
    return new Response("Send failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

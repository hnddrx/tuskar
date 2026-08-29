import { auth, currentUser } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSql, rowToCalendarEvent } from "@/lib/db";
import { buildEventInvite } from "@/lib/ics";
import { buildInviteEmail } from "@/lib/inviteEmail";
import { getSmtpConfig } from "@/lib/smtpCredentials";
import { sendViaSmtp } from "@/lib/smtpTransport";
import { formatSender } from "@/lib/smtp";

// nodemailer wants the encoding named; Resend takes a bare base64 string and
// rejects fields it does not know.
function forNodemailer(attachments) {
  return attachments.map((a) => ({
    filename: a.filename,
    content: a.content,
    encoding: "base64",
    contentType: a.contentType,
  }));
}

export async function POST(request) {
  const { userId, orgId } = await auth();
  const { scope = "personal", eventId } = await request.json();

  // The mail server configured in Settings wins; the Resend env vars remain a
  // fallback for a deployment that would rather configure sending at deploy
  // time than in the UI.
  const smtp = await getSmtpConfig(userId);
  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.EMAIL_FROM;

  if (!smtp.configured && !(resendKey && resendFrom)) {
    return Response.json(
      {
        error:
          "Email sending isn't set up yet. Add an outgoing mail server under Email Settings.",
      },
      { status: 503 }
    );
  }

  const sql = getSql();

  // Read the event server-side rather than trusting the request body: the
  // stored guest list decides who this email reaches.
  let row;
  if (scope === "team") {
    if (!orgId) {
      return Response.json({ error: "No active team" }, { status: 400 });
    }
    [row] = await sql`
      select * from team_calendar_events where id = ${eventId} and org_id = ${orgId}
    `;
  } else {
    [row] = await sql`
      select * from calendar_events where id = ${eventId} and user_id = ${userId}
    `;
  }
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const event = rowToCalendarEvent(row);
  const user = await currentUser();
  const organizerName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.emailAddresses?.[0]?.emailAddress ||
    "A Taskar user";
  const organizerEmail = user?.emailAddresses?.[0]?.emailAddress || null;

  const ics = buildEventInvite({
    event,
    organizer: organizerEmail ? { name: organizerName, email: organizerEmail } : null,
  });
  if (!ics) {
    return Response.json(
      { error: "This event can't be turned into an invite." },
      { status: 400 }
    );
  }

  const message = buildInviteEmail({
    event,
    ics,
    from: smtp.configured ? formatSender(smtp) : resendFrom,
    organizerName,
    url: new URL(`/calendar?event=${event.id}`, request.url).toString(),
  });
  if (!message) {
    return Response.json(
      { error: "Add at least one attendee with an email address first." },
      { status: 400 }
    );
  }

  // Replies go to the person who organised the meeting, not the sending
  // mailbox.
  if (organizerEmail) message.replyTo = organizerEmail;

  if (smtp.configured) {
    const result = await sendViaSmtp(smtp, {
      ...message,
      attachments: forNodemailer(message.attachments),
    });
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 502 });
    }
    return Response.json({ id: result.id, sent: message.to.length, via: "smtp" });
  }

  const resend = new Resend(resendKey);
  const { data, error } = await resend.emails.send(message);
  if (error) {
    console.warn("Resend rejected the invite", error);
    return Response.json(
      { error: error.message || "The email provider rejected the message." },
      { status: 502 }
    );
  }

  return Response.json({ id: data?.id, sent: message.to.length, via: "resend" });
}

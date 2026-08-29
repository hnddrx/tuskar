import { auth, currentUser } from "@clerk/nextjs/server";
import { Resend } from "resend";
import { getSql, rowToCalendarEvent } from "@/lib/db";
import { buildEventInvite } from "@/lib/ics";
import { buildInviteEmail } from "@/lib/inviteEmail";

// Sending is configured entirely by environment. Until Resend is provisioned
// and a verified sending domain is set, the route reports that plainly rather
// than failing in a way the UI has to guess at — the calendar page falls back
// to the .ics download it has always offered.
function senderConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey) return { error: "Email sending isn't set up yet (no Resend API key)." };
  if (!from) {
    return {
      error:
        "Email sending isn't set up yet — no verified sender address is configured.",
    };
  }
  return { apiKey, from };
}

export async function POST(request) {
  const { userId, orgId } = await auth();
  const { scope = "personal", eventId } = await request.json();

  const config = senderConfig();
  if (config.error) {
    return Response.json({ error: config.error }, { status: 503 });
  }

  const sql = getSql();

  // Read the event server-side rather than trusting the request body: the
  // guest list decides who this email reaches.
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
    return Response.json({ error: "This event can't be turned into an invite." }, { status: 400 });
  }

  const message = buildInviteEmail({
    event,
    ics,
    from: config.from,
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
  // domain's noreply mailbox.
  if (organizerEmail) message.replyTo = organizerEmail;

  const resend = new Resend(config.apiKey);
  const { data, error } = await resend.emails.send(message);

  if (error) {
    console.warn("Resend rejected the invite", error);
    return Response.json(
      { error: error.message || "The email provider rejected the message." },
      { status: 502 }
    );
  }

  return Response.json({ id: data?.id, sent: message.to.length });
}

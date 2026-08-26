import { auth } from "@clerk/nextjs/server";
import { getSql, rowToCalendarEvent } from "@/lib/db";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const sql = getSql();
  const rows = await sql`
    select * from team_calendar_events where org_id = ${orgId} order by event_date asc
  `;
  return Response.json(rows.map(rowToCalendarEvent));
}

export async function POST(request) {
  const { userId, orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const event = await request.json();
  const sql = getSql();

  const [row] = await sql`
    insert into team_calendar_events (
      id, org_id, title, description, location, event_date,
      start_time, end_time, attendees, created_by, created_at, updated_at
    ) values (
      ${event.id}, ${orgId}, ${event.title}, ${event.description || ""},
      ${event.location || ""}, ${event.eventDate}, ${event.startTime || null},
      ${event.endTime || null}, ${JSON.stringify(event.attendees || [])}::jsonb,
      ${userId}, ${event.createdAt}, ${event.updatedAt}
    )
    returning *
  `;

  return Response.json(rowToCalendarEvent(row), { status: 201 });
}

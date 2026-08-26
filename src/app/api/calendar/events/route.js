import { auth } from "@clerk/nextjs/server";
import { getSql, rowToCalendarEvent } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sql = getSql();
  const rows = await sql`
    select * from calendar_events where user_id = ${userId} order by event_date asc
  `;
  return Response.json(rows.map(rowToCalendarEvent));
}

export async function POST(request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const event = await request.json();
  const sql = getSql();

  const [row] = await sql`
    insert into calendar_events (
      id, user_id, title, description, location, event_date,
      start_time, end_time, attendees, created_at, updated_at
    ) values (
      ${event.id}, ${userId}, ${event.title}, ${event.description || ""},
      ${event.location || ""}, ${event.eventDate}, ${event.startTime || null},
      ${event.endTime || null}, ${JSON.stringify(event.attendees || [])}::jsonb,
      ${event.createdAt}, ${event.updatedAt}
    )
    returning *
  `;

  return Response.json(rowToCalendarEvent(row), { status: 201 });
}

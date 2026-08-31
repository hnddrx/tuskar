import { auth } from "@clerk/nextjs/server";
import { getSql, rowToCalendarEvent } from "@/lib/db";
import { requireTeamPermission } from "@/lib/teamPermissions";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }

  // Someone who may not see the team calendar gets an empty one rather than a
  // 403: the page is still theirs to visit, there is simply nothing in it.
  const gate = await requireTeamPermission(userId, orgId, "events.view");
  if (gate.error) return Response.json([]);

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
  const gate = await requireTeamPermission(userId, orgId, "events.create");
  if (gate.error) return gate.error;

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

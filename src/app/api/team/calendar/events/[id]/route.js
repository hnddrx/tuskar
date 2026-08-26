import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function DELETE(_request, { params }) {
  const { orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const sql = getSql();
  await sql`delete from team_calendar_events where id = ${id} and org_id = ${orgId}`;
  return Response.json({ ok: true });
}

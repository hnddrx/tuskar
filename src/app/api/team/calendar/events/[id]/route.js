import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";
import { requireTeamPermission } from "@/lib/teamPermissions";

export async function DELETE(_request, { params }) {
  const { userId, orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }

  const gate = await requireTeamPermission(userId, orgId, "events.delete");
  if (gate.error) return gate.error;

  const sql = getSql();
  // Archives rather than deletes — see lib/archive.
  const archivedAt = new Date().toISOString();
  await sql`
    update team_calendar_events set archived_at = ${archivedAt}
    where id = ${id} and org_id = ${orgId}
  `;
  return Response.json({ ok: true, archivedAt });
}

import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";
import { requireTeamPermission } from "@/lib/teamPermissions";

export async function DELETE(request, { params }) {
  const { userId, orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }

  const gate = await requireTeamPermission(userId, orgId, "comments.delete");
  if (gate.error) return gate.error;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const sql = getSql();

  const archivedAt = new Date().toISOString();

  // Archives rather than deletes. The count still drops: it reports the
  // comments on the task now, and an archived one is not one of them.
  await sql.transaction([
    sql`
      update team_comments set archived_at = ${archivedAt}
      where id = ${id} and org_id = ${orgId} and archived_at is null
    `,
    sql`
      update team_tasks set comment_count = greatest(comment_count - 1, 0)
      where id = ${taskId} and org_id = ${orgId}
    `,
  ]);

  return Response.json({ ok: true, archivedAt });
}

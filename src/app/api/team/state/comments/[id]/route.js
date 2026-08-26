import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function DELETE(request, { params }) {
  const { orgId } = await auth();
  const { id } = await params;
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const sql = getSql();

  await sql.transaction([
    sql`delete from team_comments where id = ${id} and org_id = ${orgId}`,
    sql`
      update team_tasks set comment_count = greatest(comment_count - 1, 0)
      where id = ${taskId} and org_id = ${orgId}
    `,
  ]);

  return Response.json({ ok: true });
}

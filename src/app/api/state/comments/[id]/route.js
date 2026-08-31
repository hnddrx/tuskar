import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function DELETE(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const sql = getSql();

  const archivedAt = new Date().toISOString();

  // Archives rather than deletes. The count still drops: it reports the
  // comments on the task now, and an archived one is not one of them.
  // Restoring puts it back.
  await sql.transaction([
    sql`
      update comments set archived_at = ${archivedAt}
      where id = ${id} and user_id = ${userId} and archived_at is null
    `,
    sql`
      update tasks set comment_count = greatest(comment_count - 1, 0)
      where id = ${taskId} and user_id = ${userId}
    `,
  ]);

  return Response.json({ ok: true, archivedAt });
}

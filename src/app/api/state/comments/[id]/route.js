import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function DELETE(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");
  const sql = getSql();

  await sql.transaction([
    sql`delete from comments where id = ${id} and user_id = ${userId}`,
    sql`
      update tasks set comment_count = greatest(comment_count - 1, 0)
      where id = ${taskId} and user_id = ${userId}
    `,
  ]);

  return Response.json({ ok: true });
}

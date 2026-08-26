import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sql = getSql();
  await sql`delete from calendar_events where id = ${id} and user_id = ${userId}`;
  return Response.json({ ok: true });
}

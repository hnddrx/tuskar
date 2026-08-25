import { auth } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";

export async function POST() {
  const { userId } = await auth();
  const sql = getSql();

  await sql.transaction([
    sql`delete from comments where user_id = ${userId}`,
    sql`delete from tasks where user_id = ${userId}`,
    sql`delete from board_config where user_id = ${userId}`,
  ]);

  return Response.json({ ok: true });
}

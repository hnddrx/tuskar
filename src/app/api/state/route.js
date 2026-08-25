import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTask, rowToComment } from "@/lib/db";
import seed from "@/data/seed.json";

export async function GET() {
  const { userId } = await auth();
  const sql = getSql();

  const [configRow] = await sql`
    select * from board_config where user_id = ${userId}
  `;
  const taskRows = await sql`
    select * from tasks where user_id = ${userId} order by created_at asc
  `;
  const commentRows = await sql`
    select * from comments where user_id = ${userId} order by created asc
  `;

  return Response.json({
    tasks: taskRows.map(rowToTask),
    comments: commentRows.map(rowToComment),
    config: configRow
      ? {
          statuses: configRow.statuses,
          priorities: configRow.priorities,
          types: configRow.types,
          assignees: configRow.assignees,
        }
      : seed.config,
    hasSynced: Boolean(configRow),
  });
}

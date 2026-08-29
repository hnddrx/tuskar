import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTask, rowToComment, rowToNote } from "@/lib/db";
import { DEFAULT_STATUS_PROGRESS } from "@/lib/progress";
import seed from "@/data/seed.json";

// An unconfigured (or emptied) status map means the account has never visited
// Configuration; fall back to sensible defaults so automatic progress works
// out of the box rather than silently doing nothing.
function statusProgressOf(configRow) {
  const stored = configRow?.status_progress;
  return stored && Object.keys(stored).length > 0 ? stored : DEFAULT_STATUS_PROGRESS;
}

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
  // Notes ride along with the rest of the personal state so task pages can
  // show the notes linked to a task without a second round trip.
  const noteRows = await sql`
    select * from notes where user_id = ${userId} order by updated_at desc
  `;

  return Response.json({
    tasks: taskRows.map(rowToTask),
    comments: commentRows.map(rowToComment),
    notes: noteRows.map(rowToNote),
    config: configRow
      ? {
          statuses: configRow.statuses,
          priorities: configRow.priorities,
          types: configRow.types,
          assignees: configRow.assignees,
          statusProgress: statusProgressOf(configRow),
        }
      : { ...seed.config, statusProgress: DEFAULT_STATUS_PROGRESS },
    hasSynced: Boolean(configRow),
  });
}

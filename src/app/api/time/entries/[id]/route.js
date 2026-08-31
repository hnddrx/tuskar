import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTimeEntry } from "@/lib/db";
import { nowIso } from "@/lib/id";

function secondsBetween(from, to) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/**
 * Stops a running entry, or edits a finished one.
 *
 * Stopping sends `{ stop: true }` and the server stamps the end time itself —
 * the duration of tracked work should not depend on how accurate the
 * browser's clock happens to be.
 */
export async function PATCH(request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const patch = await request.json();
  const sql = getSql();

  const [existing] = await sql`
    select * from time_entries where id = ${id} and user_id = ${userId}
  `;
  if (!existing) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const entry = rowToTimeEntry(existing);
  const ts = nowIso();

  const endedAt = patch.stop ? ts : patch.endedAt !== undefined ? patch.endedAt : entry.endedAt;
  const startedAt = patch.startedAt || entry.startedAt;

  let durationSeconds = entry.durationSeconds;
  if (patch.durationSeconds !== undefined && patch.durationSeconds !== null) {
    durationSeconds = Math.max(0, Math.round(Number(patch.durationSeconds) || 0));
  } else if (endedAt) {
    durationSeconds = secondsBetween(startedAt, endedAt);
  }

  const [row] = await sql`
    update time_entries set
      task_id = ${patch.taskId !== undefined ? patch.taskId : entry.taskId},
      description = ${patch.description !== undefined ? patch.description : entry.description},
      started_at = ${startedAt},
      ended_at = ${endedAt},
      duration_seconds = ${endedAt ? durationSeconds : null},
      updated_at = ${ts}
    where id = ${id} and user_id = ${userId}
    returning *
  `;

  return Response.json(rowToTimeEntry(row));
}

export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  const { id } = await params;
  const sql = getSql();

  // Archives rather than deletes — see lib/archive. An archived entry stops
  // counting towards a task's tracked time, and counts again if restored.
  // A running entry is closed as it is archived. Left open it stays invisibly
  // running: the lists hide it, so nothing shows a timer going, and the next
  // timer started would close it and stamp it with all the time in between.
  // Closing it here means restoring gives back the entry that was archived.
  const archivedAt = new Date().toISOString();
  await sql`
    update time_entries
    set archived_at = ${archivedAt},
        ended_at = coalesce(ended_at, ${archivedAt}),
        duration_seconds = case
          when ended_at is null then greatest(
            0,
            floor(extract(epoch from (${archivedAt}::timestamptz - started_at::timestamptz)))
          )::integer
          else duration_seconds
        end,
        updated_at = ${archivedAt}
    where id = ${id} and user_id = ${userId}
  `;

  return Response.json({ ok: true, archivedAt });
}

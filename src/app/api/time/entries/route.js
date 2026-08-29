import { auth } from "@clerk/nextjs/server";
import { getSql, rowToTimeEntry } from "@/lib/db";
import { newId, nowIso } from "@/lib/id";

export async function GET() {
  const { userId } = await auth();
  const sql = getSql();

  const rows = await sql`
    select * from time_entries where user_id = ${userId}
    order by started_at desc
  `;
  return Response.json(rows.map(rowToTimeEntry));
}

/**
 * Creates an entry. Two shapes:
 *   - a running timer: no `endedAt`. Any timer already running for this user
 *     is stopped first, so starting work on a second task can never leave two
 *     clocks going. (The unique partial index on (user_id) where ended_at is
 *     null is the backstop if two requests race.)
 *   - a completed entry: `startedAt` + `endedAt`, used by manual entry and by
 *     a finished Pomodoro interval.
 */
export async function POST(request) {
  const { userId } = await auth();
  const body = await request.json();
  const sql = getSql();
  const ts = nowIso();

  const startedAt = body.startedAt || ts;
  const endedAt = body.endedAt || null;

  if (!endedAt) {
    await stopRunning(sql, userId, ts);
  }

  const durationSeconds = endedAt
    ? Math.max(0, Math.round(Number(body.durationSeconds) || secondsBetween(startedAt, endedAt)))
    : null;

  const [row] = await sql`
    insert into time_entries (
      id, user_id, scope, org_id, task_id, description,
      started_at, ended_at, duration_seconds, source, created_at, updated_at
    ) values (
      ${newId("time")}, ${userId}, ${body.scope === "team" ? "team" : "personal"},
      ${body.orgId || null}, ${body.taskId || null}, ${body.description || ""},
      ${startedAt}, ${endedAt}, ${durationSeconds},
      ${body.source || "timer"}, ${ts}, ${ts}
    )
    returning *
  `;

  return Response.json(rowToTimeEntry(row), { status: 201 });
}

function secondsBetween(from, to) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

// Closes whatever timer is open, stamping the duration from its own start so
// the stored number never depends on the client's clock.
async function stopRunning(sql, userId, at) {
  await sql`
    update time_entries
    set ended_at = ${at},
        duration_seconds = greatest(
          0,
          floor(extract(epoch from (${at}::timestamptz - started_at::timestamptz)))
        )::integer,
        updated_at = ${at}
    where user_id = ${userId} and ended_at is null
  `;
}

import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { getSql, getUserOrgIds } from "@/lib/db";
import { archiveTypeOf } from "@/lib/archive";
import { listAttachments } from "@/lib/attachmentStore";
import { getTeamAccess } from "@/lib/teamPermissions";
import { hasPermission } from "@/lib/permissions";
import { taskMatchesRules } from "@/lib/recordRules";

// Which permission a team record's restore or purge needs. Personal records
// need none: they are the caller's own by definition.
const TEAM_PERMISSION = {
  teamTask: "tasks.delete",
  teamComment: "comments.delete",
  teamEvent: "events.delete",
};

/**
 * Restoring and purging are as much a mutation as archiving was, so they take
 * the same checks — membership was never enough, and a record hidden by a
 * member's rules must not be reachable here by id either.
 *
 * Returns an error response, or null when the caller may proceed.
 */
async function guardTeamRecord(sql, typeKey, row, userId) {
  const permission = TEAM_PERMISSION[typeKey];
  if (!permission) return null;

  const access = await getTeamAccess(userId, row.org_id);
  if (!access.member || !hasPermission(access.permissions, permission)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!access.rules) return null;

  // A comment is judged by the task it hangs off, the same way the lists do it.
  const task =
    typeKey === "teamTask"
      ? row
      : typeKey === "teamComment"
        ? (await sql`select * from team_tasks where id = ${row.ticket_id}`)[0]
        : null;
  if (!task) return null;

  return taskMatchesRules(task, access.rules, userId)
    ? null
    : Response.json({ error: "Not found" }, { status: 404 });
}

// Restoring and permanently deleting archived records.
//
// One route for every record type rather than a restore endpoint bolted onto
// each of the eight existing ones: what "restore" means is identical in every
// case, and the alternative is eight copies of the same ownership check.
//
// The table name is interpolated into SQL, so it must never come from the
// request. `archiveTypeOf` resolves the path segment against a fixed map and
// returns null for anything else — an unknown type is a 404, not a query.

async function scopedTo(type, userId) {
  if (type.scope === "user") {
    return { column: "user_id", values: [userId] };
  }
  // A team record belongs to the team, not to whoever archived it, so any
  // member of that team can restore it — and only a member can.
  const orgIds = await getUserOrgIds(userId);
  return { column: "org_id", values: orgIds };
}

async function findArchived(sql, type, id, scope) {
  const [row] = await sql.query(
    `select * from ${type.table}
     where id = $1 and ${scope.column} = any($2::text[]) and archived_at is not null`,
    [id, scope.values]
  );
  return row || null;
}

/** Restore: put the record back where it was. */
export async function POST(_request, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { type: typeKey, id } = await params;
  const type = archiveTypeOf(typeKey);
  if (!type) return Response.json({ error: "Not found" }, { status: 404 });

  const sql = getSql();
  const scope = await scopedTo(type, userId);
  const row = await findArchived(sql, type, id, scope);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const denied = await guardTeamRecord(sql, typeKey, row, userId);
  if (denied) return denied;

  await sql.query(
    `update ${type.table} set archived_at = null
     where id = $1 and ${scope.column} = any($2::text[])`,
    [id, scope.values]
  );

  // A task was archived together with its comments, all stamped at the same
  // instant. Restoring the task brings back exactly that set — comments
  // archived separately, before or after, stay archived.
  if (typeKey === "task" || typeKey === "teamTask") {
    const commentTable = typeKey === "task" ? "comments" : "team_comments";
    await sql.query(
      `update ${commentTable} set archived_at = null
       where ticket_id = $1 and ${scope.column} = any($2::text[]) and archived_at = $3`,
      [id, scope.values, row.archived_at]
    );
    await sql.query(
      `update ${type.table} set comment_count = (
         select count(*) from ${commentTable}
         where ticket_id = $1 and archived_at is null
       ) where id = $1`,
      [id]
    );
  }

  // Archiving a comment on its own dropped its task's count; restoring it has
  // to put that back, or a thread quietly reads one comment short for good.
  // Counted rather than incremented, so restoring two at once cannot race.
  if (typeKey === "comment" || typeKey === "teamComment") {
    const taskTable = typeKey === "comment" ? "tasks" : "team_tasks";
    const commentTable = typeKey === "comment" ? "comments" : "team_comments";
    await sql.query(
      `update ${taskTable} set comment_count = (
         select count(*) from ${commentTable}
         where ticket_id = $1 and archived_at is null
       ) where id = $1 and ${scope.column} = any($2::text[])`,
      [row.ticket_id, scope.values]
    );
  }

  return Response.json({ ok: true, id, type: typeKey });
}

/** Delete permanently: the one path in the app that destroys data. */
export async function DELETE(_request, { params }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { type: typeKey, id } = await params;
  const type = archiveTypeOf(typeKey);
  if (!type) return Response.json({ error: "Not found" }, { status: 404 });

  const sql = getSql();
  const scope = await scopedTo(type, userId);
  const row = await findArchived(sql, type, id, scope);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });

  const denied = await guardTeamRecord(sql, typeKey, row, userId);
  if (denied) return denied;

  // Only ever reachable for a record that is already archived, so nothing can
  // be destroyed without having been archived first.
  if (typeKey === "task" || typeKey === "teamTask") {
    const commentTable = typeKey === "task" ? "comments" : "team_comments";
    await sql.query(
      `delete from ${commentTable} where ticket_id = $1 and ${scope.column} = any($2::text[])`,
      [id, scope.values]
    );
    // Subtasks outlive their parent — they were never archived with it.
    await sql.query(
      `update ${type.table} set parent_id = null
       where parent_id = $1 and ${scope.column} = any($2::text[])`,
      [id, scope.values]
    );
  }

  // A note's attachments live in Blob storage; this is the only moment they
  // become unreachable, so it is the only moment they can be removed. The
  // registry is read rather than the note's jsonb projection — the table is
  // what actually knows where every blob is.
  if (typeKey === "note") {
    for (const attachment of await listAttachments(sql, "note", id)) {
      await del(attachment.pathname).catch(() => {});
    }
    await sql`delete from attachments where owner_kind = 'note' and owner_id = ${id}`;
  }

  await sql.query(
    `delete from ${type.table} where id = $1 and ${scope.column} = any($2::text[])`,
    [id, scope.values]
  );

  return Response.json({ ok: true, id, type: typeKey });
}

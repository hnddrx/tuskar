// Resolving and enforcing what a team member may do.
//
// The permission *model* is in lib/permissions and is pure; this is the part
// that talks to Clerk and the database. Routes call `requireTeamPermission`
// and return its `error` response if there is one — so the check reads the
// same way everywhere, and a route that forgets it is easy to spot.

import { clerkClient } from "@clerk/nextjs/server";
import { getSql } from "@/lib/db";
import { hasPermission, permissionsForMember } from "@/lib/permissions";

function isAdminRole(role) {
  return String(role || "").includes("admin");
}

function displayName(publicUserData) {
  return (
    [publicUserData?.firstName, publicUserData?.lastName].filter(Boolean).join(" ") ||
    publicUserData?.identifier ||
    "Unknown"
  );
}

/**
 * One person's standing in one team: are they in it, are they an admin, and
 * what may they do.
 *
 * Non-membership is reported rather than thrown so callers can answer 404
 * instead of 403 — someone who is not in a team should not learn that it
 * exists.
 */
export async function getTeamAccess(userId, orgId) {
  const denied = { member: false, isAdmin: false, permissions: [] };
  if (!userId || !orgId) return denied;

  // Read from the user's own memberships rather than listing the whole team:
  // one call returns every team they are in together with their role in each,
  // and it works the same whether the team has three people or three hundred.
  const clerk = await clerkClient();
  const { data } = await clerk.users.getOrganizationMembershipList({ userId, limit: 100 });
  const me = data.find((m) => m.organization?.id === orgId);
  if (!me) return denied;

  const isAdmin = isAdminRole(me.role);
  const sql = getSql();
  const [row] = await sql`
    select permissions from team_permissions
    where org_id = ${orgId} and user_id = ${userId}
  `;

  return {
    member: true,
    isAdmin,
    // `row` absent means nobody has decided; a row holding [] is a decision.
    permissions: permissionsForMember({ isAdmin, stored: row ? row.permissions : null }),
  };
}

/**
 * What this person may do in every team they are in, keyed by team id.
 *
 * The list routes need this for all teams at once — to drop the teams whose
 * work they may not see, and to tell the client which buttons to show. Two
 * round trips total: one to Clerk for memberships and roles, one to the
 * database for every stored decision about them.
 */
export async function getAccessByOrg(userId) {
  if (!userId) return {};

  const clerk = await clerkClient();
  const { data } = await clerk.users.getOrganizationMembershipList({ userId, limit: 100 });
  const orgIds = data.map((m) => m.organization?.id).filter(Boolean);
  if (orgIds.length === 0) return {};

  const sql = getSql();
  const rows = await sql`
    select org_id, permissions from team_permissions
    where user_id = ${userId} and org_id = any(${orgIds}::text[])
  `;
  const stored = new Map(rows.map((r) => [r.org_id, r.permissions]));

  const byOrg = {};
  for (const m of data) {
    const id = m.organization?.id;
    if (!id) continue;
    const isAdmin = isAdminRole(m.role);
    byOrg[id] = {
      isAdmin,
      permissions: permissionsForMember({
        isAdmin,
        stored: stored.has(id) ? stored.get(id) : null,
      }),
    };
  }
  return byOrg;
}

/**
 * The gate every team route puts in front of a mutation.
 *
 * Returns `{ error }` to send back, or `{ access }` when the caller may
 * proceed. A non-member gets 404 rather than 403: 403 would confirm the team
 * exists to someone with no business knowing.
 */
export async function requireTeamPermission(userId, orgId, permission) {
  const access = await getTeamAccess(userId, orgId);
  if (!access.member) {
    return { error: Response.json({ error: "Not found" }, { status: 404 }) };
  }
  if (!hasPermission(access.permissions, permission)) {
    return {
      error: Response.json(
        { error: "You don't have permission to do that in this team." },
        { status: 403 }
      ),
    };
  }
  return { access };
}

/**
 * Everyone in a team with the permissions in force for them — what the access
 * screen lists. Admins come back flagged, with the full set, so the screen can
 * show why their checkboxes are fixed.
 */
export async function getTeamRoster(orgId) {
  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });

  const sql = getSql();
  const rows = await sql`
    select user_id, permissions from team_permissions where org_id = ${orgId}
  `;
  const stored = new Map(rows.map((r) => [r.user_id, r.permissions]));

  return data
    .filter((m) => m.publicUserData?.userId)
    .map((m) => {
      const id = m.publicUserData.userId;
      const isAdmin = isAdminRole(m.role);
      return {
        id,
        name: displayName(m.publicUserData),
        email: m.publicUserData.identifier || null,
        isAdmin,
        // Whether a decision has been recorded, so the screen can say
        // "defaults" rather than implying someone chose this.
        configured: stored.has(id),
        permissions: permissionsForMember({
          isAdmin,
          stored: stored.has(id) ? stored.get(id) : null,
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Records an admin's decision about one member. */
export async function setTeamPermissions(orgId, userId, permissions, updatedBy) {
  const sql = getSql();
  await sql`
    insert into team_permissions (org_id, user_id, permissions, updated_at, updated_by)
    values (${orgId}, ${userId}, ${JSON.stringify(permissions)}::jsonb,
            ${new Date().toISOString()}, ${updatedBy})
    on conflict (org_id, user_id) do update
      set permissions = excluded.permissions,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by
  `;
}

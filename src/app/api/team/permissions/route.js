import { auth } from "@clerk/nextjs/server";
import { normalizePermissions } from "@/lib/permissions";
import { normalizeRules } from "@/lib/recordRules";
import { getTeamAccess, getTeamRoster, setTeamPermissions } from "@/lib/teamPermissions";

/**
 * Who is in the active team and what each of them may do.
 *
 * Admins only, to read as well as to write: who has been given what is the
 * admin's business, and a member who cannot change any of it has no reason to
 * be shown the whole team's access. A non-admin gets 404 rather than 403 —
 * the screen does not exist for them, so neither should the endpoint.
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!orgId) return Response.json({ error: "No active team" }, { status: 400 });

  const access = await getTeamAccess(userId, orgId);
  if (!access.member || !access.isAdmin) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({
    members: await getTeamRoster(orgId),
    canManage: true,
    me: { id: userId, isAdmin: true, permissions: access.permissions },
  });
}

export async function PUT(request) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!orgId) return Response.json({ error: "No active team" }, { status: 400 });

  const access = await getTeamAccess(userId, orgId);
  if (!access.member) return Response.json({ error: "Not found" }, { status: 404 });
  if (!access.isAdmin) {
    return Response.json(
      { error: "Only a team admin can change access." },
      { status: 403 }
    );
  }

  const { userId: memberId, permissions, rules } = await request.json();
  if (!memberId) {
    return Response.json({ error: "Which member?" }, { status: 400 });
  }

  // The member must be in this team — otherwise an admin of one team could
  // write a row for someone in another.
  const roster = await getTeamRoster(orgId);
  const target = roster.find((m) => m.id === memberId);
  if (!target) return Response.json({ error: "Not a member of this team" }, { status: 404 });

  // An admin's permissions are their role, not a stored row. Storing one would
  // be ignored on read, so saying so is better than pretending it took.
  if (target.isAdmin) {
    return Response.json(
      { error: "Admins always have full access. Change their role in Clerk instead." },
      { status: 400 }
    );
  }

  // Whatever the client sent, only permissions and conditions we recognise
  // are stored — an invented field or operator never reaches the database.
  await setTeamPermissions(
    orgId,
    memberId,
    normalizePermissions(permissions),
    normalizeRules(rules),
    userId
  );

  return Response.json({ members: await getTeamRoster(orgId), canManage: true });
}

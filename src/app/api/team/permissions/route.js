import { auth } from "@clerk/nextjs/server";
import { normalizePermissions } from "@/lib/permissions";
import { getTeamAccess, getTeamRoster, setTeamPermissions } from "@/lib/teamPermissions";

/**
 * Who is in the active team and what each of them may do.
 *
 * Any member may read this: they can already see who they work with, and
 * someone needs to be able to check their own access without asking an admin.
 * Only an admin may change it.
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!orgId) return Response.json({ error: "No active team" }, { status: 400 });

  const access = await getTeamAccess(userId, orgId);
  if (!access.member) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    members: await getTeamRoster(orgId),
    canManage: access.isAdmin,
    me: { id: userId, isAdmin: access.isAdmin, permissions: access.permissions },
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

  const { userId: memberId, permissions } = await request.json();
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

  // Whatever the client sent, only permissions we recognise are stored.
  await setTeamPermissions(orgId, memberId, normalizePermissions(permissions), userId);

  return Response.json({ members: await getTeamRoster(orgId), canManage: true });
}

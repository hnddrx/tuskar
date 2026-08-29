import { auth, clerkClient } from "@clerk/nextjs/server";
import { getReachableMembers } from "@/lib/db";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  // No team selected still has an answer: everyone you share any team with.
  if (!orgId) {
    const { members } = await getReachableMembers(userId);
    return Response.json(members);
  }

  const clerk = await clerkClient();
  const { data } = await clerk.organizations.getOrganizationMembershipList({
    organizationId: orgId,
  });

  const members = data.map((m) => ({
    id: m.publicUserData?.userId,
    name:
      [m.publicUserData?.firstName, m.publicUserData?.lastName].filter(Boolean).join(" ") ||
      m.publicUserData?.identifier ||
      "Unknown",
    email: m.publicUserData?.identifier || null,
  }));

  return Response.json(members);
}

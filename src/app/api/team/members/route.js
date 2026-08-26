import { auth, clerkClient } from "@clerk/nextjs/server";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return Response.json({ error: "No active team" }, { status: 400 });
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

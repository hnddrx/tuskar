import { auth } from "@clerk/nextjs/server";
import { getReachableMembers } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { members } = await getReachableMembers(userId);
  return Response.json(members);
}

import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Finds one person by their exact email address, so a direct message can be
 * started with someone outside your teams.
 *
 * Exact match only, and it returns at most one person. There is deliberately
 * no partial search and no listing: a browsable directory would let any signed
 * in user enumerate every other user of the app, which is not something a
 * multi-tenant install should allow just to make starting a chat convenient.
 */
export async function GET(request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const email = String(searchParams.get("email") || "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return Response.json({ error: "Enter a full email address." }, { status: 400 });
  }

  const clerk = await clerkClient();
  const { data } = await clerk.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });

  const found = data[0];
  if (!found) {
    return Response.json({ error: "Nobody here uses that email address." }, { status: 404 });
  }
  if (found.id === userId) {
    return Response.json({ error: "That's your own address." }, { status: 400 });
  }

  return Response.json({
    id: found.id,
    name:
      [found.firstName, found.lastName].filter(Boolean).join(" ") ||
      found.emailAddresses?.[0]?.emailAddress ||
      "Unknown",
    email: found.emailAddresses?.[0]?.emailAddress || null,
  });
}

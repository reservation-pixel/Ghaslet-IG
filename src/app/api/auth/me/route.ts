import { getCurrentUser } from "@/lib/auth/guard";
import { findUserById, toPublicUser } from "@/database/userRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const claims = await getCurrentUser();
  if (!claims) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read through to the row rather than trusting the token's copy: a
  // deactivated or renamed user should be reflected without waiting out the
  // access token's 15 minutes.
  const user = await findUserById(claims.sub);
  if (!user || !user.is_active) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ user: toPublicUser(user) });
}

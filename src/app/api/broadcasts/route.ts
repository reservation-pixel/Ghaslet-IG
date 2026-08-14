import { requireAdmin } from "@/lib/auth/guard";
import {
  createBroadcast,
  countUniqueReachable,
  listBroadcasts,
} from "@/database/broadcastRepository";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  const [broadcasts, reachable] = await Promise.all([
    listBroadcasts(),
    countUniqueReachable(),
  ]);

  return Response.json({ broadcasts, reachable });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  const body = await request.json();
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > 1000) {
    return Response.json({ error: "Message too long (max 1000 chars)" }, { status: 400 });
  }

  const broadcast = await createBroadcast(message, auth.sub);
  return Response.json(broadcast, { status: 201 });
}

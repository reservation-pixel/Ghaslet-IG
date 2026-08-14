import { requireAdmin } from "@/lib/auth/guard";
import { getBroadcast, getRecipients } from "@/database/broadcastRepository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const broadcast = await getBroadcast(id);
  if (!broadcast) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const recipients = await getRecipients(id, undefined, 500);
  return Response.json({ broadcast, recipients });
}

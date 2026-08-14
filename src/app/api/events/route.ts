import { NextRequest } from "next/server";
import { listEvents } from "@/database/notificationRepository";
import type { EventSource, EventType, InstagramEvent } from "@/lib/types";
import { requireUser } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

const EVENT_TYPES: EventType[] = ["follow", "like", "comment"];
const SOURCES: EventSource[] = ["meta", "playwright"];

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  const params = request.nextUrl.searchParams;

  const typeParam = params.get("type");
  const sourceParam = params.get("source");
  const statusParam = params.get("status");
  const limitParam = Number.parseInt(params.get("limit") ?? "", 10);

  try {
    const events = await listEvents({
      eventType: EVENT_TYPES.includes(typeParam as EventType)
        ? (typeParam as EventType)
        : undefined,
      source: SOURCES.includes(sourceParam as EventSource)
        ? (sourceParam as EventSource)
        : undefined,
      status: statusParam ? (statusParam as InstagramEvent["status"]) : undefined,
      limit: Number.isFinite(limitParam) ? Math.min(limitParam, 500) : 100,
    });

    return Response.json(events);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

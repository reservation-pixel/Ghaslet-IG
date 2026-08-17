import { count, query } from "@/lib/db";
import { getSettings } from "@/database/automationRuleRepository";
import { countDmsSince } from "@/database/notificationRepository";
import { requireUser } from "@/lib/auth/guard";
import type { EventType } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAYS = 14;

export interface DayBucket {
  date: string; // YYYY-MM-DD
  follow: number;
  like: number;
  comment: number;
}

export interface StatsResponse {
  contacts: number;
  contactsNew7d: number;
  contactsPrev7d: number;
  followers7d: number;
  followersPrev7d: number;
  comments7d: number;
  commentsPrev7d: number;
  dmsToday: number;
  dailyCap: number;
  autoReplyRate: number | null;
  series: DayBucket[];
  failures: number;
}

function dayKey(d: Date): string {
  // Local-day bucketing, so "today" on the dashboard matches the operator's day.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

export async function GET() {
  const auth = await requireUser();
  if (auth instanceof Response) return auth;

  try {
    const windowStart = daysAgo(DAYS - 1);
    const week = daysAgo(6);
    const prevWeek = daysAgo(13);
    const today = daysAgo(0);

    const [
      contacts,
      contactsNew7d,
      contactsPrev7d,
      recentEvents,
      failures,
      dmsToday,
      settings,
      outbound,
      inbound,
    ] = await Promise.all([
      count("select count(*) from instagram_conversations"),
      count("select count(*) from instagram_conversations where created_at >= $1", [
        week.toISOString(),
      ]),
      count(
        "select count(*) from instagram_conversations where created_at >= $1 and created_at < $2",
        [prevWeek.toISOString(), week.toISOString()]
      ),
      query<{ event_type: EventType; created_at: string }>(
        "select event_type, created_at from instagram_events where created_at >= $1",
        [prevWeek.toISOString()]
      ),
      count("select count(*) from instagram_events where status = 'failed'"),
      countDmsSince(today),
      getSettings(),
      count("select count(*) from instagram_messages where role = 'assistant' and created_at >= $1", [
        week.toISOString(),
      ]),
      count("select count(*) from instagram_messages where role = 'user' and created_at >= $1", [
        week.toISOString(),
      ]),
    ]);

    // Bucket by local day, pre-seeding every day so gaps render as zero rather
    // than collapsing the axis.
    const buckets = new Map<string, DayBucket>();
    for (let i = DAYS - 1; i >= 0; i--) {
      const key = dayKey(daysAgo(i));
      buckets.set(key, { date: key, follow: 0, like: 0, comment: 0 });
    }

    let followers7d = 0;
    let followersPrev7d = 0;
    let comments7d = 0;
    let commentsPrev7d = 0;

    for (const row of recentEvents) {
      const created = new Date(row.created_at);
      const type = row.event_type;

      const bucket = buckets.get(dayKey(created));
      if (bucket && created >= windowStart) bucket[type] += 1;

      const inThisWeek = created >= week;
      if (type === "follow") {
        if (inThisWeek) followers7d++;
        else followersPrev7d++;
      } else if (type === "comment") {
        if (inThisWeek) comments7d++;
        else commentsPrev7d++;
      }
    }

    const payload: StatsResponse = {
      contacts,
      contactsNew7d,
      contactsPrev7d,
      followers7d,
      followersPrev7d,
      comments7d,
      commentsPrev7d,
      // countDmsSince fails closed with MAX_SAFE_INTEGER so the cap check never
      // opens the floodgates on a DB error — but that must not reach a stat tile.
      dmsToday: dmsToday === Number.MAX_SAFE_INTEGER ? 0 : dmsToday,
      dailyCap: settings.daily_dm_cap,
      autoReplyRate: inbound > 0 ? Math.round((outbound / inbound) * 100) : null,
      series: [...buckets.values()],
      failures,
    };

    return Response.json(payload);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}

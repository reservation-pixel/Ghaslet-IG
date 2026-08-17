"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ActivityChart from "@/components/ActivityChart";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatTile,
  compact,
  formatRelative,
  type Tone,
} from "@/components/ui";
import type { StatsResponse } from "@/app/api/stats/route";
import type { AutomationSettings, EventType, InstagramEvent } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

const TYPE_TONE: Record<EventType, Tone> = {
  follow: "cat-1",
  like: "cat-2",
  comment: "cat-3",
};

const TYPE_LABEL: Record<EventType, string> = {
  follow: "Follow",
  like: "Like",
  comment: "Comment",
};

export default function DashboardPage() {

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [events, setEvents] = useState<InstagramEvent[]>([]);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [statsRes, eventsRes, settingsRes] = await Promise.all([
      apiFetch("/api/stats"),
      apiFetch("/api/events?limit=8"),
      apiFetch("/api/automation/settings"),
    ]);
    if (statsRes.ok) setStats(await statsRes.json());
    if (eventsRes.ok) setEvents(await eventsRes.json());
    if (settingsRes.ok) setSettings(await settingsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Replaces the old Supabase Realtime subscription.
  useLiveRefresh(load, 10_000);


  const capPct = stats && stats.dailyCap > 0 ? Math.min(100, (stats.dmsToday / stats.dailyCap) * 100) : 0;
  const capTone = capPct >= 100 ? "var(--critical)" : capPct >= 80 ? "var(--warning)" : "var(--accent)";

  const followTrend = stats?.series.map((d) => d.follow) ?? [];
  const commentTrend = stats?.series.map((d) => d.comment) ?? [];
  const totalTrend = stats?.series.map((d) => d.follow + d.like + d.comment) ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Dashboard"
        subtitle="Followers, likes and comments across the Meta API and Instagram Web."
      />

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Contacts"
          value={loading ? "—" : compact(stats?.contacts ?? 0)}
          delta={stats ? stats.contactsNew7d - stats.contactsPrev7d : null}
          deltaLabel="vs prior 7 days"
          trend={totalTrend}
        />
        <StatTile
          label="New followers (7d)"
          value={loading ? "—" : compact(stats?.followers7d ?? 0)}
          delta={stats ? stats.followers7d - stats.followersPrev7d : null}
          deltaLabel="vs prior 7 days"
          trend={followTrend}
        />
        <StatTile
          label="Comments handled (7d)"
          value={loading ? "—" : compact(stats?.comments7d ?? 0)}
          delta={stats ? stats.comments7d - stats.commentsPrev7d : null}
          deltaLabel="vs prior 7 days"
          trend={commentTrend}
        />
        <Card>
          <p className="text-xs font-medium" style={{ color: "var(--ink-muted)" }}>
            DMs sent today
          </p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-[28px] font-semibold leading-none" style={{ color: "var(--ink)" }}>
              {loading ? "—" : (stats?.dmsToday ?? 0)}
            </span>
            <span className="text-sm" style={{ color: "var(--ink-muted)" }}>
              / {stats?.dailyCap ?? 0}
            </span>
          </div>
          {/* Meter: a single ratio against a limit. Track is a lighter step of
              the same ramp, so state reads across the whole bar. */}
          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--accent-soft)" }}
            role="meter"
            aria-valuenow={stats?.dmsToday ?? 0}
            aria-valuemin={0}
            aria-valuemax={stats?.dailyCap ?? 0}
            aria-label="Daily DM cap usage"
          >
            <div className="h-full rounded-full" style={{ width: `${capPct}%`, background: capTone }} />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
            {capPct >= 100 ? "Daily cap reached" : `${Math.round(capPct)}% of daily cap`}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chart */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Activity" subtitle="Events per day, last 14 days" />
            {stats ? (
              <ActivityChart data={stats.series} />
            ) : (
              <div className="h-[200px] animate-pulse rounded-[8px]" style={{ background: "var(--surface-2)" }} />
            )}
          </Card>
        </div>

        {/* Automation status */}
        <Card>
          <CardHeader
            title="Automation"
            action={
              <Link
                href="/automation"
                className="text-xs font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--accent)" }}
              >
                Configure
              </Link>
            }
          />
          {settings ? (
            <div className="flex flex-col gap-2.5">
              <StatusRow label="AI replies" on={settings.use_ai} />
              <StatusRow label="Comments" on={settings.comment_automation_enabled} />
              <StatusRow label="Followers" on={settings.follow_automation_enabled} />
              <StatusRow label="Likes" on={settings.like_automation_enabled} offLabel="Record only" />

              <div className="mt-1 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                <StatusRow
                  label="Web session"
                  on={settings.playwright_session_valid}
                  offLabel="Expired"
                  critical
                />
                {!settings.playwright_session_valid && (
                  <p className="mt-2 text-xs" style={{ color: "var(--ink-muted)" }}>
                    Run{" "}
                    <code
                      className="rounded px-1 py-0.5 text-[11px]"
                      style={{ background: "var(--surface-2)" }}
                    >
                      npm run worker:login
                    </code>{" "}
                    to restore follower and like detection.
                  </p>
                )}
              </div>

              {stats && stats.failures > 0 && (
                <Link href="/activity?status=failed" className="mt-1">
                  <Badge tone="critical" dot>
                    {stats.failures} failed event{stats.failures !== 1 ? "s" : ""}
                  </Badge>
                </Link>
              )}
            </div>
          ) : (
            <div className="h-[180px] animate-pulse rounded-[8px]" style={{ background: "var(--surface-2)" }} />
          )}
        </Card>
      </div>

      {/* Recent activity */}
      <div className="mt-4">
        <Card>
          <CardHeader
            title="Recent activity"
            action={
              <Link
                href="/activity"
                className="text-xs font-medium underline-offset-2 hover:underline"
                style={{ color: "var(--accent)" }}
              >
                View all
              </Link>
            }
          />
          {events.length === 0 ? (
            <EmptyState
              title="No activity yet"
              hint="Followers and likes appear once the worker polls; comments arrive through the Meta webhook."
            />
          ) : (
            <div className="flex flex-col">
              {events.map((event, i) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 py-2.5"
                  style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
                >
                  <Badge tone={TYPE_TONE[event.event_type]}>{TYPE_LABEL[event.event_type]}</Badge>
                  <span className="truncate text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                    {event.actor_username ? `@${event.actor_username}` : "unknown"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--ink-muted)" }}>
                    {event.content ?? ""}
                  </span>
                  <span className="flex-shrink-0 text-xs" style={{ color: "var(--ink-muted)" }}>
                    {formatRelative(event.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  on,
  offLabel = "Off",
  critical = false,
}: {
  label: string;
  on: boolean;
  offLabel?: string;
  critical?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px]" style={{ color: "var(--ink-secondary)" }}>
        {label}
      </span>
      <Badge tone={on ? "good" : critical ? "critical" : "neutral"} dot>
        {on ? "On" : offLabel}
      </Badge>
    </div>
  );
}

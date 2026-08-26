"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
  formatRelative,
  type Tone,
} from "@/components/ui";
import type { AutomationSettings, EventStatus, EventType, InstagramEvent } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "follow", label: "Followers" },
  { key: "like", label: "Likes" },
  { key: "comment", label: "Comments" },
] as const;

const TYPE_TONE: Record<EventType, Tone> = { follow: "cat-1", like: "cat-2", comment: "cat-3" };
const TYPE_LABEL: Record<EventType, string> = { follow: "Follow", like: "Like", comment: "Comment" };

const STATUS_TONE: Record<EventStatus, Tone> = {
  done: "good",
  pending: "accent",
  processing: "accent",
  skipped: "neutral",
  failed: "critical",
};

const ACTION_LABEL: Record<string, string> = {
  public_reply: "Public reply",
  private_dm: "Private DM",
  web_dm: "Web DM",
  none: "No action",
};

export default function ActivityPage() {
  return (
    <Suspense fallback={null}>
      <Activity />
    </Suspense>
  );
}

function Activity() {
  const searchParams = useSearchParams();


  const [events, setEvents] = useState<InstagramEvent[]>([]);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [type, setType] = useState<(typeof TYPE_FILTERS)[number]["key"]>("all");
  const [status, setStatus] = useState<EventStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [queuing, setQueuing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Deep link from the dashboard's failure badge.
  useEffect(() => {
    const wanted = searchParams.get("status");
    if (wanted) setStatus(wanted as EventStatus);
  }, [searchParams]);

  const load = useCallback(async () => {
    const [eventsRes, settingsRes] = await Promise.all([
      apiFetch("/api/events?limit=250"),
      apiFetch("/api/automation/settings"),
    ]);
    if (eventsRes.ok) setEvents(await eventsRes.json());
    if (settingsRes.ok) setSettings(await settingsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load, 10_000);


  async function queueDm(event: InstagramEvent) {
    setQueuing(event.id);
    await apiFetch(`/api/events/${event.id}/dm`, { method: "POST" });
    setQueuing(null);
    load();
  }

  const visible = useMemo(() => {
    let rows = events;
    if (type !== "all") rows = rows.filter((e) => e.event_type === type);
    if (status !== "all") rows = rows.filter((e) => e.status === status);
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((e) =>
        `${e.actor_username ?? ""} ${e.content ?? ""} ${e.reply_text ?? ""}`.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [events, type, status, query]);

  const sessionExpired = settings !== null && !settings.playwright_session_valid;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Activity"
        subtitle="Every follow, like and comment, and what the automation did about it."
      />

      {sessionExpired && (
        <div
          className="mb-4 flex items-start gap-2.5 rounded-[12px] border p-3.5"
          style={{ background: "var(--critical-soft)", borderColor: "var(--border)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--critical)"
            strokeWidth="2"
            strokeLinecap="round"
            className="mt-0.5 flex-shrink-0"
            aria-hidden
          >
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" />
          </svg>
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
              Instagram Web session expired — follower and like detection is paused
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-secondary)" }}>
              Run{" "}
              <code className="rounded px-1 py-0.5" style={{ background: "var(--surface-2)" }}>
                npm run worker:login
              </code>{" "}
              and log in manually to restore it.
              {settings?.playwright_last_error ? ` (${settings.playwright_last_error})` : ""}
            </p>
          </div>
        </div>
      )}

      <Card padded={false}>
        <div
          className="flex flex-wrap items-center gap-2 border-b p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="min-w-[180px] flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search username or content"
              aria-label="Search activity"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {TYPE_FILTERS.map((f) => {
              const active = type === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setType(f.key)}
                  className="rounded-[8px] border px-2.5 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.96]"
                  style={{
                    background: active ? "var(--accent-soft)" : "transparent",
                    borderColor: active ? "transparent" : "var(--border)",
                    color: active ? "var(--accent)" : "var(--ink-secondary)",
                  }}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as EventStatus | "all")}
            aria-label="Filter by status"
            className="rounded-[8px] border px-2.5 py-1.5 text-xs outline-none"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--ink-secondary)",
            }}
          >
            <option value="all">Any status</option>
            <option value="done">Done</option>
            <option value="pending">Pending</option>
            <option value="skipped">Skipped</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {loading ? (
          <div className="p-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="mb-2 h-11 animate-pulse rounded-[8px]"
                style={{ background: "var(--surface-2)" }}
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            title={events.length === 0 ? "No activity yet" : "No events match"}
            hint={
              events.length === 0
                ? "Followers and likes appear once the worker polls; comments arrive through the Meta webhook."
                : "Try a different search or filter."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Contact</Th>
                <Th>Detail</Th>
                <Th>Outcome</Th>
                <Th align="right">When</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {visible.map((event) => {
                const canDm =
                  event.source === "playwright" &&
                  !!event.actor_username &&
                  event.status !== "pending" &&
                  event.status !== "processing" &&
                  event.action_taken !== "web_dm";

                return (
                  <tr key={event.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                    <Td>
                      <Badge tone={TYPE_TONE[event.event_type]}>{TYPE_LABEL[event.event_type]}</Badge>
                    </Td>

                    <Td>
                      <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                        {event.actor_username ? `@${event.actor_username}` : "—"}
                      </span>
                      <span className="block text-[11px]" style={{ color: "var(--ink-muted)" }}>
                        via {event.source === "meta" ? "Meta API" : "Instagram Web"}
                      </span>
                    </Td>

                    <Td>
                      <span className="block max-w-[280px] truncate">{event.content ?? "—"}</span>
                      {event.reply_text && (
                        <span
                          className="mt-1 block max-w-[280px] truncate border-l-2 pl-2 text-xs"
                          style={{ borderColor: "var(--accent)", color: "var(--ink-muted)" }}
                        >
                          {event.reply_text}
                        </span>
                      )}
                      {event.status === "failed" && event.error && (
                        <span className="mt-1 block max-w-[280px] truncate text-xs" style={{ color: "var(--critical)" }}>
                          {event.error}
                        </span>
                      )}
                    </Td>

                    <Td>
                      <span className="flex flex-col items-start gap-1">
                        <Badge tone={STATUS_TONE[event.status]} dot>
                          {event.status}
                        </Badge>
                        {event.action_taken && (
                          <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                            {ACTION_LABEL[event.action_taken] ?? event.action_taken}
                          </span>
                        )}
                      </span>
                    </Td>

                    <Td align="right" className="whitespace-nowrap">
                      {formatRelative(event.created_at)}
                    </Td>

                    <Td align="right">
                      {canDm && (
                        <Button size="sm" onClick={() => queueDm(event)} disabled={queuing === event.id}>
                          {queuing === event.id ? "Queuing…" : "Send DM"}
                        </Button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {!loading && visible.length > 0 && (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
          Showing {visible.length} of {events.length} events
        </p>
      )}
    </div>
  );
}

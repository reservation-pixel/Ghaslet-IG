"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Textarea,
  Th,
  formatRelative,
  type Tone,
} from "@/components/ui";
import { apiFetch, apiJson } from "@/lib/apiFetch";

interface Broadcast {
  id: string;
  message: string;
  status: "draft" | "sending" | "paused" | "done" | "failed";
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Recipient {
  id: string;
  actor_igsid: string;
  actor_username: string | null;
  status: "pending" | "sent" | "failed" | "skipped";
  error: string | null;
  sent_at: string | null;
}

const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  sending: "accent",
  paused: "warning",
  done: "good",
  failed: "critical",
  pending: "neutral",
  sent: "good",
  skipped: "neutral",
};

export default function BroadcastPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [reachable, setReachable] = useState(0);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const [active, setActive] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);

  const loadList = useCallback(async () => {
    const data = await apiJson<{ broadcasts: Broadcast[]; reachable: number }>("/api/broadcasts");
    if (data) {
      setBroadcasts(data.broadcasts);
      setReachable(data.reachable);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function create() {
    if (!message.trim()) return;
    setCreating(true);
    const res = await apiFetch("/api/broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() }),
    });
    if (res.ok) {
      const broadcast = await res.json();
      setMessage("");
      setActive(broadcast);
      setRecipients([]);
      await loadDetail(broadcast.id);
      await loadList();
    }
    setCreating(false);
  }

  async function loadDetail(id: string) {
    const data = await apiJson<{ broadcast: Broadcast; recipients: Recipient[] }>(
      `/api/broadcasts/${id}`
    );
    if (data) {
      setActive(data.broadcast);
      setRecipients(data.recipients);
    }
  }

  async function startSending() {
    if (!active || sendingRef.current) return;
    setSending(true);
    sendingRef.current = true;

    let done = false;
    while (!done && sendingRef.current) {
      const res = await apiFetch(`/api/broadcasts/${active.id}/send`, { method: "POST" });
      if (!res.ok) break;
      const data = await res.json();
      if (data.broadcast) setActive(data.broadcast);
      done = data.done;
      if (!done) await loadDetail(active.id);
    }

    await loadDetail(active.id);
    await loadList();
    setSending(false);
    sendingRef.current = false;
  }

  function stopSending() {
    sendingRef.current = false;
    setSending(false);
  }

  if (active) {
    const pending = active.total_recipients - active.sent_count - active.failed_count;
    const progress =
      active.total_recipients > 0
        ? Math.round(((active.sent_count + active.failed_count) / active.total_recipients) * 100)
        : 0;

    return (
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
        <div className="mb-4">
          <button
            onClick={() => { setActive(null); stopSending(); }}
            className="text-xs font-medium hover:underline"
            style={{ color: "var(--accent)" }}
          >
            &larr; All broadcasts
          </button>
        </div>

        <PageHeader
          title="Broadcast"
          subtitle={`Created ${formatRelative(active.created_at)}`}
          action={<Badge tone={STATUS_TONE[active.status]}>{active.status}</Badge>}
        />

        <Card className="mb-4">
          <CardHeader title="Message" />
          <div
            className="whitespace-pre-wrap rounded-[8px] p-3 text-[13px]"
            style={{ background: "var(--surface-2)", color: "var(--ink)" }}
          >
            {active.message}
          </div>
        </Card>

        <Card className="mb-4">
          <CardHeader title="Progress" />

          <div className="mb-3 flex flex-wrap gap-4 text-[13px]">
            <Stat label="Total" value={active.total_recipients} />
            <Stat label="Sent" value={active.sent_count} tone="good" />
            <Stat label="Failed" value={active.failed_count} tone="critical" />
            <Stat label="Pending" value={pending} />
          </div>

          <div
            className="mb-4 h-2 overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: active.failed_count > 0 && active.sent_count === 0
                  ? "var(--critical)"
                  : "var(--good)",
              }}
            />
          </div>

          <div className="flex gap-2">
            {active.status !== "done" && !sending && (
              <Button onClick={startSending}>
                {active.sent_count > 0 ? "Resume sending" : "Start sending"}
              </Button>
            )}
            {sending && (
              <Button onClick={stopSending} variant="secondary">
                Pause
              </Button>
            )}
            {sending && (
              <span className="flex items-center text-xs" style={{ color: "var(--ink-muted)" }}>
                Sending…
              </span>
            )}
          </div>
        </Card>

        <Card padded={false}>
          <div className="p-3">
            <CardHeader title="Recipients" subtitle={`${recipients.length} shown`} />
          </div>
          {recipients.length === 0 ? (
            <EmptyState title="No recipients" hint="No reachable contacts found." />
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Contact</Th>
                    <Th>Status</Th>
                    <Th align="right">Sent</Th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id}>
                      <Td>
                        <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                          {r.actor_username ? `@${r.actor_username}` : r.actor_igsid}
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge>
                        {r.error && (
                          <span
                            className="mt-0.5 block max-w-[260px] truncate text-[11px]"
                            style={{ color: "var(--critical)" }}
                          >
                            {r.error}
                          </span>
                        )}
                      </Td>
                      <Td align="right" className="whitespace-nowrap text-xs">
                        <span style={{ color: "var(--ink-muted)" }}>
                          {r.sent_at ? formatRelative(r.sent_at) : "—"}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Broadcast"
        subtitle="Send a message to everyone who has interacted with your account."
      />

      <Card className="mb-6">
        <CardHeader
          title="New broadcast"
          subtitle={`${reachable} reachable contacts (followers, likers, commenters & DM contacts)`}
        />

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message here…"
          rows={6}
          maxLength={1000}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
            {message.length}/1000
          </span>
          <Button onClick={create} disabled={!message.trim() || creating}>
            {creating ? "Creating…" : `Create broadcast (${reachable} recipients)`}
          </Button>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-4">
          <CardHeader title="Past broadcasts" />
        </div>
        {loading ? (
          <div className="p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="mb-2 h-11 animate-pulse rounded-[8px]" style={{ background: "var(--surface-2)" }} />
            ))}
          </div>
        ) : broadcasts.length === 0 ? (
          <EmptyState title="No broadcasts yet" hint="Create one above to get started." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Message</Th>
                <Th>Status</Th>
                <Th align="right">Sent</Th>
                <Th align="right">Created</Th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((b) => (
                <tr
                  key={b.id}
                  className="cursor-pointer transition-colors hover:bg-[var(--surface-hover)]"
                  onClick={() => { setActive(b); loadDetail(b.id); }}
                >
                  <Td>
                    <span className="block max-w-[320px] truncate text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                      {b.message}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[b.status]} dot>{b.status}</Badge>
                  </Td>
                  <Td align="right" className="tabular text-[13px]">
                    {b.sent_count}/{b.total_recipients}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    {formatRelative(b.created_at)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  return (
    <div>
      <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
        {label}
      </span>
      <span
        className="ml-1.5 tabular text-sm font-semibold"
        style={{ color: tone ? `var(--${tone})` : "var(--ink)" }}
      >
        {value}
      </span>
    </div>
  );
}

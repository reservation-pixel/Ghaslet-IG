"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  Table,
  Td,
  Th,
  compact,
  formatRelative,
} from "@/components/ui";
import type { ConversationWithLastMessage } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";
import { useLiveRefresh } from "@/lib/useLiveRefresh";

type SortKey = "recent" | "followers" | "name";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "agent", label: "AI handled" },
  { key: "human", label: "Human handled" },
  { key: "follower", label: "Follows you" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function ContactsPage() {

  const [contacts, setContacts] = useState<ConversationWithLastMessage[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/conversations");
    if (res.ok) setContacts(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useLiveRefresh(load, 15_000);


  async function setMode(contact: ConversationWithLastMessage, mode: "agent" | "human") {
    setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, mode } : c)));
    await apiFetch(`/api/conversations/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
  }

  const visible = useMemo(() => {
    let rows = contacts;

    if (filter === "agent") rows = rows.filter((c) => c.mode === "agent");
    if (filter === "human") rows = rows.filter((c) => c.mode === "human");
    if (filter === "follower") rows = rows.filter((c) => c.is_user_follow_business);

    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((c) =>
        `${c.name ?? ""} ${c.username ?? ""} ${c.igsid}`.toLowerCase().includes(q)
      );
    }

    const sorted = [...rows];
    if (sort === "followers") {
      sorted.sort((a, b) => (b.follower_count ?? -1) - (a.follower_count ?? -1));
    } else if (sort === "name") {
      sorted.sort((a, b) =>
        (a.name || a.username || a.igsid).localeCompare(b.name || b.username || b.igsid)
      );
    }
    // "recent" is the API's own order (updated_at desc), so leave it alone.
    return sorted;
  }, [contacts, filter, query, sort]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Contacts"
        subtitle="Everyone who has messaged the account, with their handling mode."
      />

      <Card padded={false}>
        <div
          className="flex flex-wrap items-center gap-2 border-b p-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="min-w-[200px] flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, username or IGSID"
              aria-label="Search contacts"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className="rounded-[8px] border px-2.5 py-1.5 text-xs font-medium transition-colors"
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
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort contacts"
            className="rounded-[8px] border px-2.5 py-1.5 text-xs outline-none"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--ink-secondary)",
            }}
          >
            <option value="recent">Most recent</option>
            <option value="followers">Most followers</option>
            <option value="name">Name A–Z</option>
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
            title={contacts.length === 0 ? "No contacts yet" : "No contacts match"}
            hint={
              contacts.length === 0
                ? "A contact is created the first time someone DMs the account or a comment triggers a private reply."
                : "Try a different search or filter."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Contact</Th>
                <Th align="right">Followers</Th>
                <Th>Relationship</Th>
                <Th>Last message</Th>
                <Th align="right">Activity</Th>
                <Th align="right">Mode</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                  <Td>
                    <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-2.5">
                      <Avatar src={c.profile_pic} name={c.name} fallback={c.igsid} size={30} />
                      <span className="min-w-0">
                        <span
                          className="block truncate text-[13px] font-medium"
                          style={{ color: "var(--ink)" }}
                        >
                          {c.name || c.username || c.igsid}
                        </span>
                        {c.username && (
                          <span className="block truncate text-xs" style={{ color: "var(--ink-muted)" }}>
                            @{c.username}
                          </span>
                        )}
                      </span>
                    </Link>
                  </Td>

                  <Td align="right" className="tabular">
                    {c.follower_count === null ? (
                      <span style={{ color: "var(--ink-muted)" }}>—</span>
                    ) : (
                      compact(c.follower_count)
                    )}
                  </Td>

                  <Td>
                    <span className="flex flex-wrap gap-1">
                      {c.is_user_follow_business && <Badge tone="accent">Follows you</Badge>}
                      {c.is_business_follow_user && <Badge tone="neutral">You follow</Badge>}
                      {!c.is_user_follow_business && !c.is_business_follow_user && (
                        <span style={{ color: "var(--ink-muted)" }}>—</span>
                      )}
                    </span>
                  </Td>

                  <Td>
                    <span className="block max-w-[240px] truncate">{c.last_message ?? "—"}</span>
                  </Td>

                  <Td align="right" className="whitespace-nowrap">
                    {formatRelative(c.updated_at)}
                  </Td>

                  <Td align="right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setMode(c, c.mode === "agent" ? "human" : "agent")}
                      title={c.mode === "agent" ? "Switch to human handling" : "Hand back to AI"}
                    >
                      <Badge tone={c.mode === "agent" ? "good" : "warning"} dot>
                        {c.mode === "agent" ? "AI" : "Human"}
                      </Badge>
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {!loading && visible.length > 0 && (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-muted)" }}>
          Showing {visible.length} of {contacts.length} contacts
        </p>
      )}
    </div>
  );
}

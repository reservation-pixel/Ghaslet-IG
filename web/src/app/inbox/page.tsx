"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Avatar, Badge, Button, EmptyState, Input, formatRelative, formatTime } from "@/components/ui";
import type { ConversationWithLastMessage, Message } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useCanManage } from "@/components/SessionContext";

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const searchParams = useSearchParams();
  const canManage = useCanManage();

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId);

  const fetchConversations = useCallback(async () => {
    const res = await apiFetch("/api/conversations");
    if (!res.ok) return;
    setConversations(await res.json());
  }, []);

  const fetchMessages = useCallback(async (convoId: string) => {
    const res = await apiFetch(`/api/conversations/${convoId}/messages`);
    if (!res.ok) return;
    setMessages(await res.json());
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Replaces the old Supabase Realtime subscription. Faster than the other
  // pages: an inbox that lags on an incoming DM feels broken.
  useLiveRefresh(() => {
    fetchConversations();
    if (selectedId) fetchMessages(selectedId);
  }, 5_000);

  // Deep link from the contacts table: /inbox?c=<id>
  useEffect(() => {
    const wanted = searchParams.get("c");
    if (wanted) setSelectedId(wanted);
  }, [searchParams]);

  useEffect(() => {
    if (selectedId) fetchMessages(selectedId);
  }, [selectedId, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "agent" ? "human" : "agent";
    await apiFetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, mode: newMode } : c))
    );
  }

  async function handleSend() {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    await apiFetch(`/api/conversations/${selectedId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.trim() }),
    });
    setInput("");
    setSending(false);
    fetchMessages(selectedId);
  }

  const filtered = query
    ? conversations.filter((c) =>
        `${c.name ?? ""} ${c.username ?? ""} ${c.igsid}`.toLowerCase().includes(query.toLowerCase())
      )
    : conversations;

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div
        className="flex w-[300px] flex-shrink-0 flex-col border-r"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="border-b p-3" style={{ borderColor: "var(--border)" }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <EmptyState
              title={query ? "No matches" : "No conversations"}
              hint={query ? undefined : "Inbound DMs will appear here."}
            />
          )}

          {filtered.map((convo) => {
            const isSelected = selectedId === convo.id;
            return (
              <button
                key={convo.id}
                onClick={() => setSelectedId(convo.id)}
                className="relative w-full border-b px-3 py-3 text-left transition-colors"
                style={{
                  borderColor: "var(--border)",
                  background: isSelected ? "var(--accent-soft)" : "transparent",
                }}
              >
                {isSelected && (
                  <span
                    className="absolute inset-y-0 left-0 w-[2px]"
                    style={{ background: "var(--accent)" }}
                    aria-hidden
                  />
                )}
                <div className="flex items-start gap-2.5">
                  <Avatar src={convo.profile_pic} name={convo.name} fallback={convo.igsid} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="truncate text-[13px] font-medium"
                        style={{ color: "var(--ink)" }}
                      >
                        {convo.name || convo.username || convo.igsid}
                      </span>
                      <span
                        className="flex-shrink-0 text-[10px]"
                        style={{ color: "var(--ink-muted)" }}
                      >
                        {formatRelative(convo.updated_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs" style={{ color: "var(--ink-muted)" }}>
                        {convo.last_message || (convo.username ? `@${convo.username}` : "—")}
                      </p>
                      <Badge tone={convo.mode === "agent" ? "accent" : "warning"}>
                        {convo.mode === "agent" ? "AI" : "You"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: "var(--page)" }}>
        {!selected ? (
          <EmptyState
            title="Select a conversation"
            hint="Choose someone from the list to read the thread and reply."
          />
        ) : (
          <>
            <div
              className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-3"
              style={{ background: "var(--surface)", borderColor: "var(--border)" }}
            >
              <div className="flex items-center gap-3">
                <Avatar src={selected.profile_pic} name={selected.name} fallback={selected.igsid} size={38} />
                <div>
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                      {selected.name || selected.username || selected.igsid}
                    </h2>
                    {selected.username && (
                      <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                        @{selected.username}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {selected.follower_count !== null && (
                      <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                        <span className="tabular font-medium" style={{ color: "var(--ink-secondary)" }}>
                          {selected.follower_count.toLocaleString()}
                        </span>{" "}
                        followers
                      </span>
                    )}
                    {selected.is_user_follow_business && <Badge tone="accent">Follows you</Badge>}
                    {selected.is_business_follow_user && <Badge tone="neutral">You follow</Badge>}
                  </div>
                </div>
              </div>

              {canManage && (
                <Button
                  onClick={toggleMode}
                  variant={selected.mode === "agent" ? "secondary" : "primary"}
                  size="sm"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: selected.mode === "agent" ? "var(--good)" : "var(--warning)" }}
                    aria-hidden
                  />
                  {selected.mode === "agent" ? "AI replying" : "Human takeover"}
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.length === 0 && (
                <EmptyState title="No messages yet" />
              )}
              {messages.map((msg, i) => {
                const isUser = msg.role === "user";
                const showTime = i === messages.length - 1 || messages[i + 1]?.role !== msg.role;
                return (
                  <div key={msg.id} className={`flex items-end gap-2 ${isUser ? "justify-start" : "justify-end"}`}>
                    {isUser && (
                      <Avatar src={selected.profile_pic} name={selected.name} fallback={selected.igsid} size={24} />
                    )}
                    <div className={`flex max-w-[62%] flex-col ${isUser ? "items-start" : "items-end"}`}>
                      <div
                        className="rounded-[12px] border px-3.5 py-2 text-[13px] leading-relaxed"
                        style={
                          isUser
                            ? {
                                background: "var(--surface)",
                                borderColor: "var(--border)",
                                color: "var(--ink)",
                                borderTopLeftRadius: 3,
                              }
                            : {
                                backgroundImage: "var(--brand-gradient)",
                                borderColor: "transparent",
                                color: "#ffffff",
                                borderTopRightRadius: 3,
                              }
                        }
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                      {showTime && (
                        <p className="mt-1 px-0.5 text-[10px]" style={{ color: "var(--ink-muted)" }}>
                          {!isUser && "Agent · "}
                          {formatTime(msg.created_at)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {canManage && (
              <div
                className="flex-shrink-0 border-t px-5 py-3"
                style={{ background: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    placeholder={
                      selected.mode === "agent"
                        ? "Send a manual message (AI stays on)"
                        : "Type a reply…"
                    }
                    aria-label="Message"
                  />
                  <Button onClick={handleSend} disabled={sending || !input.trim()} variant="primary">
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

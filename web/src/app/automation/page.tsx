"use client";

import { useCallback, useEffect, useState } from "react";
import { useCanManage, useSession } from "@/components/SessionContext";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Textarea,
  Toggle,
  type Tone,
} from "@/components/ui";
import type { AutomationRule, AutomationSettings, EventType } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";

const EVENT_TYPES: EventType[] = ["comment", "follow", "like"];

const TYPE_TONE: Record<EventType, Tone> = { follow: "cat-1", like: "cat-2", comment: "cat-3" };
const TYPE_LABEL: Record<EventType, string> = { follow: "Follow", like: "Like", comment: "Comment" };

const EMPTY_DRAFT = {
  event_type: "comment" as EventType,
  match_keywords: "",
  public_reply_template: "",
  dm_template: "",
  ai_instruction: "",
  use_ai: false,
  enabled: true,
  priority: 0,
};

type Draft = typeof EMPTY_DRAFT;

export default function AutomationPage() {
  const canManage = useCanManage();
  const session = useSession();
  const isSuperadmin = session?.role === "superadmin";
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tokenPreview, setTokenPreview] = useState<string | null>(null);
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);

  const load = useCallback(async () => {
    const [rulesRes, settingsRes] = await Promise.all([
      apiFetch("/api/automation/rules"),
      apiFetch("/api/automation/settings"),
    ]);
    if (rulesRes.ok) setRules(await rulesRes.json());
    if (settingsRes.ok) setSettings(await settingsRes.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isSuperadmin) return;
    apiFetch("/api/settings/token").then(async (res) => {
      if (!res.ok) return;
      const data = await res.json();
      setTokenConfigured(data.configured);
      setTokenPreview(data.preview);
    });
  }, [isSuperadmin]);

  async function saveToken() {
    setTokenSaving(true);
    setTokenSaved(false);
    const res = await apiFetch("/api/settings/token", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenInput }),
    });
    if (res.ok) {
      const data = await res.json();
      setTokenConfigured(data.configured);
      setTokenPreview(data.preview);
      setTokenInput("");
      setTokenSaved(true);
      setTimeout(() => setTokenSaved(false), 2000);
    }
    setTokenSaving(false);
  }

  async function patchSettings(patch: Partial<AutomationSettings>) {
    // Optimistic — a toggle that lags behind the click feels broken.
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    const res = await apiFetch("/api/automation/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) setSettings(await res.json());
    else load();
  }

  async function createRule() {
    setSaving(true);
    setError(null);

    const res = await apiFetch("/api/automation/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });

    if (res.ok) {
      setDraft({ ...EMPTY_DRAFT, event_type: draft.event_type });
      setShowForm(false);
      await load();
    } else {
      const body = await res.json().catch(() => ({ error: "Request failed" }));
      setError(body.error ?? "Request failed");
    }
    setSaving(false);
  }

  async function toggleRule(rule: AutomationRule) {
    setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)));
    await apiFetch(`/api/automation/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    load();
  }

  async function removeRule(rule: AutomationRule) {
    await apiFetch(`/api/automation/rules/${rule.id}`, { method: "DELETE" });
    load();
  }

  const grouped = EVENT_TYPES.map((type) => ({
    type,
    rules: rules.filter((r) => r.event_type === type),
  }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Automation"
        subtitle="Rules decide what gets sent. Nothing is sent unless a rule matches."
        action={
          canManage ? (
            <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Cancel" : "New rule"}
            </Button>
          ) : undefined
        }
      />

      {/* Global switches */}
      {canManage && settings && (
        <Card className="mb-4">
          <CardHeader title="Global settings" subtitle="These override individual rules." />

          <div className="grid grid-cols-1 gap-x-8 gap-y-3.5 md:grid-cols-2">
            <SettingRow
              label="AI replies"
              hint="When off, every rule falls back to its static template."
              checked={settings.use_ai}
              onChange={(v) => patchSettings({ use_ai: v })}
            />
            <SettingRow
              label="Comment automation"
              hint="Public reply plus a private DM, via the Meta webhook."
              checked={settings.comment_automation_enabled}
              onChange={(v) => patchSettings({ comment_automation_enabled: v })}
            />
            <SettingRow
              label="Follower automation"
              hint="DM new followers through Instagram Web."
              checked={settings.follow_automation_enabled}
              onChange={(v) => patchSettings({ follow_automation_enabled: v })}
            />
            <SettingRow
              label="Like automation"
              hint="Off by default — auto-DMing likers carries a high account risk."
              checked={settings.like_automation_enabled}
              onChange={(v) => patchSettings({ like_automation_enabled: v })}
            />

            <label className="flex items-center justify-between gap-4 md:col-span-2">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                  Daily DM cap
                </span>
                <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
                  Web DMs and comment private replies combined. Resets at local midnight.
                </span>
              </span>
              <input
                type="number"
                min={0}
                value={settings.daily_dm_cap}
                onChange={(e) => patchSettings({ daily_dm_cap: Number(e.target.value) })}
                className="tabular w-20 flex-shrink-0 rounded-[8px] border px-2.5 py-1.5 text-right text-[13px] outline-none focus:border-[var(--accent)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border-strong)",
                  color: "var(--ink)",
                }}
              />
            </label>
          </div>
        </Card>
      )}

      {/* Instagram access token (superadmin only) */}
      {isSuperadmin && (
        <Card className="mb-4">
          <CardHeader
            title="Instagram access token"
            subtitle={
              tokenConfigured
                ? `Configured: ${tokenPreview}`
                : "Not set — falling back to environment variable."
            }
          />
          <div className="flex items-end gap-3">
            <div className="min-w-0 flex-1">
              <Input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder={tokenConfigured ? "Paste new token to replace" : "Paste your Instagram access token"}
              />
            </div>
            <Button onClick={saveToken} disabled={tokenSaving || !tokenInput.trim()}>
              {tokenSaving ? "Saving..." : "Save"}
            </Button>
            {tokenConfigured && (
              <Button
                variant="danger"
                onClick={async () => {
                  setTokenSaving(true);
                  const res = await apiFetch("/api/settings/token", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token: "" }),
                  });
                  if (res.ok) {
                    setTokenConfigured(false);
                    setTokenPreview(null);
                  }
                  setTokenSaving(false);
                }}
                disabled={tokenSaving}
              >
                Remove
              </Button>
            )}
            {tokenSaved && (
              <span className="text-xs font-medium" style={{ color: "var(--good)" }}>
                Saved
              </span>
            )}
          </div>
        </Card>
      )}

      {/* New rule form */}
      {canManage && showForm && (
        <Card className="mb-4">
          <CardHeader title="New rule" />

          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              <Field label="Event">
                <Select
                  value={draft.event_type}
                  onChange={(e) => setDraft({ ...draft, event_type: e.target.value as EventType })}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Priority" hint="Higher wins. The first match is used.">
                <Input
                  type="number"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                />
              </Field>
            </div>

            <Field label="Keywords" hint="Comma-separated, whole-word. Leave empty for a catch-all.">
              <Input
                value={draft.match_keywords}
                onChange={(e) => setDraft({ ...draft, match_keywords: e.target.value })}
                placeholder="price, link, info"
              />
            </Field>

            {draft.event_type === "comment" && (
              <Field label="Public reply" hint="Posted in the comment thread.">
                <Input
                  value={draft.public_reply_template}
                  onChange={(e) => setDraft({ ...draft, public_reply_template: e.target.value })}
                  placeholder="Thanks {{username}} — just sent you a DM!"
                />
              </Field>
            )}

            <Field label="DM template" hint="Used when AI is off, and as the fallback if AI fails.">
              <Textarea
                value={draft.dm_template}
                onChange={(e) => setDraft({ ...draft, dm_template: e.target.value })}
                rows={3}
                placeholder="Hey {{username}}, thanks for reaching out!"
              />
            </Field>

            <label className="flex items-center gap-2.5">
              <Toggle
                checked={draft.use_ai}
                onChange={(v) => setDraft({ ...draft, use_ai: v })}
                label="Generate the DM with AI"
              />
              <span className="text-[13px]" style={{ color: "var(--ink)" }}>
                Generate the DM with AI
              </span>
            </label>

            {draft.use_ai && (
              <Field label="AI instruction" hint="Appended to the base system prompt for this rule.">
                <Textarea
                  value={draft.ai_instruction}
                  onChange={(e) => setDraft({ ...draft, ai_instruction: e.target.value })}
                  rows={2}
                  placeholder="Warmly welcome the new follower and ask what brought them here."
                />
              </Field>
            )}

            {error && (
              <p className="text-xs" style={{ color: "var(--critical)" }}>
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="primary" onClick={createRule} disabled={saving}>
                {saving ? "Saving…" : "Add rule"}
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Rules, grouped by event */}
      {rules.length === 0 ? (
        <Card>
          <EmptyState
            title="No rules yet"
            hint="Nothing will be sent until at least one rule matches. Events with no rule are recorded as skipped."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(({ type, rules: group }) =>
            group.length === 0 ? null : (
              <Card key={type} padded={false}>
                <div
                  className="flex items-center gap-2 border-b px-5 py-3"
                  style={{ borderColor: "var(--border)" }}
                >
                  <Badge tone={TYPE_TONE[type]}>{TYPE_LABEL[type]}</Badge>
                  <span className="text-xs" style={{ color: "var(--ink-muted)" }}>
                    {group.length} rule{group.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="flex flex-col">
                  {group.map((rule, i) => {
                    const isScript = !rule.match_keywords || rule.match_keywords.length === 0;
                    return (
                      <div
                        key={rule.id}
                        className="flex items-start justify-between gap-4 px-5 py-4"
                        style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                              {isScript ? "Default script" : rule.match_keywords!.join(", ")}
                            </span>
                            {isScript && <Badge tone="accent">Script</Badge>}
                            {rule.use_ai && <Badge tone="cat-2">AI</Badge>}
                            {!isScript && (
                              <span className="text-[11px]" style={{ color: "var(--ink-muted)" }}>
                                priority {rule.priority}
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex flex-col gap-1 text-[13px]">
                            {rule.public_reply_template && (
                              <TemplateLine label="Public" text={rule.public_reply_template} />
                            )}
                            {rule.dm_template && <TemplateLine label="DM" text={rule.dm_template} />}
                            {rule.ai_instruction && (
                              <TemplateLine label="AI" text={rule.ai_instruction} />
                            )}
                          </div>
                        </div>

                        {canManage ? (
                          <div className="flex flex-shrink-0 items-center gap-2">
                            <Toggle
                              checked={rule.enabled}
                              onChange={() => toggleRule(rule)}
                              label={`${rule.enabled ? "Disable" : "Enable"} rule`}
                            />
                            <Button size="sm" variant="danger" onClick={() => removeRule(rule)}>
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}

function TemplateLine({ label, text }: { label: string; text: string }) {
  return (
    <p style={{ color: "var(--ink-secondary)" }}>
      <span
        className="mr-1.5 text-[11px] font-medium uppercase tracking-wide"
        style={{ color: "var(--ink-muted)" }}
      >
        {label}
      </span>
      {text}
    </p>
  );
}

function SettingRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-[13px] font-medium" style={{ color: "var(--ink)" }}>
          {label}
        </span>
        <span className="block text-xs" style={{ color: "var(--ink-muted)" }}>
          {hint}
        </span>
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

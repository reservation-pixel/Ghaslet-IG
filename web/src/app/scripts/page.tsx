"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  Field,
  PageHeader,
  Textarea,
  Toggle,
  Input,
} from "@/components/ui";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { useCanManage } from "@/components/SessionContext";
import type { AutomationRule } from "@/lib/types";

interface ScriptsData {
  follow: { rule: AutomationRule | null };
  like: { rule: AutomationRule | null };
  comment: { rule: AutomationRule | null };
  dm: { systemPrompt: string };
}

interface ScriptDraft {
  dm_template: string;
  public_reply_template: string;
  use_ai: boolean;
  ai_instruction: string;
}

function ruleToScriptDraft(rule: AutomationRule | null): ScriptDraft {
  return {
    dm_template: rule?.dm_template ?? "",
    public_reply_template: rule?.public_reply_template ?? "",
    use_ai: rule?.use_ai ?? false,
    ai_instruction: rule?.ai_instruction ?? "",
  };
}

const CARDS: {
  type: string;
  title: string;
  hint: string;
  icon: React.ReactNode;
  showPublicReply: boolean;
}[] = [
  {
    type: "follow",
    title: "New Follower",
    hint: "Sent as a DM when someone follows your account (via Playwright).",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="8.5" cy="7" r="4" />
        <line x1="20" y1="8" x2="20" y2="14" />
        <line x1="23" y1="11" x2="17" y2="11" />
      </svg>
    ),
    showPublicReply: false,
  },
  {
    type: "comment",
    title: "New Comment",
    hint: "A public reply in the thread, plus a private DM to the commenter.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
    showPublicReply: true,
  },
  {
    type: "like",
    title: "New Like",
    hint: "Sent as a DM when someone likes your post (disabled by default in settings).",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    showPublicReply: false,
  },
];

export default function ScriptsPage() {
  const canManage = useCanManage();
  const [drafts, setDrafts] = useState<Record<string, ScriptDraft>>({
    follow: ruleToScriptDraft(null),
    like: ruleToScriptDraft(null),
    comment: ruleToScriptDraft(null),
  });
  const [dmPrompt, setDmPrompt] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await apiJson<ScriptsData>("/api/scripts");
    if (data) {
      setDrafts({
        follow: ruleToScriptDraft(data.follow.rule),
        like: ruleToScriptDraft(data.like.rule),
        comment: ruleToScriptDraft(data.comment.rule),
      });
      setDmPrompt(data.dm.systemPrompt);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateDraft(type: string, patch: Partial<ScriptDraft>) {
    setDrafts((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  async function saveScript(type: string) {
    setSaving(type);
    setSaved(null);

    const body =
      type === "dm"
        ? { systemPrompt: dmPrompt }
        : drafts[type];

    const res = await apiFetch(`/api/scripts/${type}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setSaved(type);
      setTimeout(() => setSaved((prev) => (prev === type ? null : prev)), 2000);
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
        <PageHeader title="Scripts" subtitle="Loading..." />
        <div className="flex flex-col gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-[12px]"
              style={{ background: "var(--surface-2)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Scripts"
        subtitle="Set the default message for each type of interaction. Use {{username}} to insert the person's handle."
      />

      <div className="flex flex-col gap-5">
        {CARDS.map(({ type, title, hint, icon, showPublicReply }) => {
          const draft = drafts[type];
          return (
            <Card key={type}>
              <div className="mb-4 flex items-start gap-3">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px]"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    {title}
                  </h2>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
                    {hint}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {showPublicReply && (
                  <Field label="Public reply" hint="Posted in the comment thread.">
                    <Input
                      value={draft.public_reply_template}
                      onChange={(e) =>
                        updateDraft(type, { public_reply_template: e.target.value })
                      }
                      placeholder="Thanks {{username}} — check your DMs!"
                      disabled={!canManage}
                    />
                  </Field>
                )}

                <Field
                  label="DM message"
                  hint="Sent as a private message. Used when AI is off, and as fallback if AI fails."
                >
                  <Textarea
                    value={draft.dm_template}
                    onChange={(e) => updateDraft(type, { dm_template: e.target.value })}
                    rows={4}
                    placeholder={`Hey {{username}}, thanks for the ${type === "follow" ? "follow" : type === "like" ? "love" : "comment"}!`}
                    disabled={!canManage}
                  />
                </Field>

                <label className="flex items-center gap-2.5">
                  <Toggle
                    checked={draft.use_ai}
                    onChange={(v) => updateDraft(type, { use_ai: v })}
                    label="Generate with AI"
                  />
                  <span className="text-[13px]" style={{ color: "var(--ink)" }}>
                    Generate DM with AI instead
                  </span>
                </label>

                {draft.use_ai && (
                  <Field
                    label="AI instruction"
                    hint="Extra context appended to the system prompt for this event."
                  >
                    <Textarea
                      value={draft.ai_instruction}
                      onChange={(e) =>
                        updateDraft(type, { ai_instruction: e.target.value })
                      }
                      rows={2}
                      placeholder="Be warm and mention our hot sauce. Keep it under 3 sentences."
                    />
                  </Field>
                )}

                {canManage && (
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => saveScript(type)}
                      disabled={saving === type}
                    >
                      {saving === type ? "Saving…" : "Save"}
                    </Button>
                    {saved === type && (
                      <span className="text-xs font-medium" style={{ color: "var(--good)" }}>
                        Saved
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        {/* DM System Prompt */}
        <Card>
          <div className="mb-4 flex items-start gap-3">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[8px]"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                Incoming DM
              </h2>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
                The AI system prompt that guides how the bot replies to incoming direct messages.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Field label="System prompt" hint="Describes the bot's personality, tone, and boundaries.">
              <Textarea
                value={dmPrompt}
                onChange={(e) => setDmPrompt(e.target.value)}
                rows={8}
                placeholder="You are a friendly AI assistant managing Instagram DMs..."
                disabled={!canManage}
              />
            </Field>

            {canManage && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => saveScript("dm")}
                  disabled={saving === "dm"}
                >
                  {saving === "dm" ? "Saving…" : "Save"}
                </Button>
                {saved === "dm" && (
                  <span className="text-xs font-medium" style={{ color: "var(--good)" }}>
                    Saved
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, PageHeader } from "@/components/ui";
import { apiFetch, apiJson } from "@/lib/apiFetch";
import { useCanManage } from "@/components/SessionContext";

interface BrainData {
  systemPrompt: string;
}

export default function BrainPage() {
  const canManage = useCanManage();
  const [prompt, setPrompt] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasChanges = prompt !== savedPrompt;

  const load = useCallback(async () => {
    const data = await apiJson<BrainData>("/api/brain");
    if (data) {
      setPrompt(data.systemPrompt);
      setSavedPrompt(data.systemPrompt);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setSaved(false);
    const res = await apiFetch("/api/brain", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: prompt }),
    });
    if (res.ok) {
      setSavedPrompt(prompt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function resetToDefault() {
    setSaving(true);
    setSaved(false);
    const res = await apiFetch("/api/brain", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: null }),
    });
    if (res.ok) {
      await load();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
  const charCount = prompt.length;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
        <PageHeader title="Brain" subtitle="Loading..." />
        <div
          className="h-[60vh] animate-pulse rounded-[12px]"
          style={{ background: "var(--surface-2)" }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <PageHeader
        title="Brain"
        subtitle="The AI system prompt that drives all automated replies — DMs, comments, follows, and likes."
      />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={
                savedPrompt === prompt && !hasChanges
                  ? { background: "var(--accent-soft)", color: "var(--accent)" }
                  : { background: "var(--warning-soft)", color: "var(--ink)" }
              }
            >
              {hasChanges ? "Unsaved changes" : "Saved"}
            </span>
          </div>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--ink-muted)" }}>
            {wordCount.toLocaleString()} words · {charCount.toLocaleString()} chars
          </span>
        </div>

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={!canManage}
          rows={28}
          spellCheck={false}
          className="w-full resize-y rounded-[8px] border px-4 py-3 text-[13px] leading-relaxed outline-none transition-colors placeholder:opacity-50 focus:border-[var(--accent)]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border-strong)",
            color: "var(--ink)",
            fontFamily: "ui-monospace, 'Cascadia Code', 'SF Mono', Consolas, monospace",
            minHeight: "40vh",
          }}
          placeholder="Paste or write the AI system prompt here..."
        />

        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={save} disabled={saving || !hasChanges}>
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button variant="ghost" onClick={resetToDefault} disabled={saving}>
              Reset to default
            </Button>
            {saved && (
              <span className="text-xs font-medium" style={{ color: "var(--good)" }}>
                Saved
              </span>
            )}
          </div>
        )}
      </Card>

      <p className="mt-4 text-xs" style={{ color: "var(--ink-muted)" }}>
        When AI is enabled on a rule, its instruction is appended to this brain.
      </p>
    </div>
  );
}

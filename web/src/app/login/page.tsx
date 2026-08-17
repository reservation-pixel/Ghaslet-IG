"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input } from "@/components/ui";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** Only same-origin paths — never bounce to an attacker-supplied URL. */
  const next = (() => {
    const raw = searchParams.get("next");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
    return raw;
  })();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Sign in failed");
        setSubmitting(false);
        return;
      }

      // Full navigation, not router.push — the layout needs to re-render
      // server-side now that the cookie exists.
      window.location.href = next;
    } catch {
      setError("Could not reach the server");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "var(--page)" }}
    >
      <div className="w-full max-w-[380px]">
        {/* Decorative only — nothing sits on the vivid gradient. */}
        <div
          className="fixed inset-x-0 top-0 h-[3px]"
          style={{ backgroundImage: "var(--brand-gradient-vivid)" }}
          aria-hidden
        />

        <div className="mb-7 flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[15px] font-bold"
            style={{ backgroundImage: "var(--brand-gradient)", color: "#ffffff" }}
          >
            G
          </div>
          <div>
            <p className="text-[15px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
              Ghaslet
            </p>
            <p className="text-[11px] leading-tight" style={{ color: "var(--ink-muted)" }}>
              Instagram CRM
            </p>
          </div>
        </div>

        <div
          className="rounded-[12px] border p-6"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "var(--shadow)",
          }}
        >
          <h1 className="text-base font-semibold" style={{ color: "var(--ink)" }}>
            Sign in
          </h1>
          <p className="mt-1 text-[13px]" style={{ color: "var(--ink-secondary)" }}>
            This dashboard can read and send Instagram messages.
          </p>

          <form onSubmit={submit} className="mt-5 flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--ink)" }}>
                Email
              </span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
                autoFocus
                placeholder="you@example.com"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--ink)" }}>
                Password
              </span>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                placeholder="••••••••••••"
              />
            </label>

            {error && (
              <div
                className="rounded-[8px] px-3 py-2 text-[13px]"
                style={{ background: "var(--critical-soft)", color: "var(--ink)" }}
                role="alert"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              disabled={submitting || !email || !password}
              className="mt-1 w-full justify-center py-2"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs" style={{ color: "var(--ink-muted)" }}>
          Superadmin is{" "}
          <code className="rounded px-1 py-0.5" style={{ background: "var(--surface-2)" }}>
            admin@ghaslet.local
          </code>
          . Add more with{" "}
          <code className="rounded px-1 py-0.5" style={{ background: "var(--surface-2)" }}>
            npm run create-user
          </code>
        </p>
      </div>
    </div>
  );
}

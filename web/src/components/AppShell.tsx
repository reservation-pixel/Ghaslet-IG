"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { SessionProvider, type SessionUser } from "@/components/SessionContext";
import { apiJson } from "@/lib/apiFetch";
import type { AutomationSettings } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/auth/roles";

/** Routes that render without the shell. */
const BARE_ROUTES = new Set(["/login"]);

function initials(user: SessionUser | null): string {
  if (!user) return "··";
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const icon = (d: React.ReactNode) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="flex-shrink-0"
  >
    {d}
  </svg>
);

const BASE_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: icon(
          <>
            <rect x="3" y="3" width="7" height="9" rx="1" />
            <rect x="14" y="3" width="7" height="5" rx="1" />
            <rect x="14" y="12" width="7" height="9" rx="1" />
            <rect x="3" y="16" width="7" height="5" rx="1" />
          </>
        ),
      },
    ],
  },
  {
    title: "Engage",
    items: [
      {
        href: "/inbox",
        label: "Inbox",
        icon: icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
      },
      {
        href: "/contacts",
        label: "Contacts",
        icon: icon(
          <>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </>
        ),
      },
      {
        href: "/activity",
        label: "Activity",
        icon: icon(<path d="M22 12h-4l-3 9L9 3l-3 9H2" />),
      },
    ],
  },
  {
    title: "Outreach",
    items: [
      {
        href: "/brain",
        label: "Brain",
        icon: icon(
          <>
            <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
            <line x1="10" y1="22" x2="14" y2="22" />
          </>
        ),
      },
    ],
  },
  {
    title: "Configure",
    items: [
      {
        href: "/automation",
        label: "Automation",
        icon: icon(
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </>
        ),
      },
    ],
  },
];

const TEAM_SECTION: { title: string; items: NavItem[] } = {
  title: "Admin",
  items: [
    {
      href: "/team",
      label: "Team",
      icon: icon(
        <>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      ),
    },
  ],
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_ROUTES.has(pathname);

  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (bare) return;

    let cancelled = false;
    const load = async () => {
      const [settingsData, meData] = await Promise.all([
        apiJson<AutomationSettings>("/api/automation/settings"),
        apiJson<{ user: SessionUser }>("/api/auth/me"),
      ]);
      if (cancelled) return;
      if (settingsData) setSettings(settingsData);
      if (meData?.user) setUser(meData.user);
    };
    load();

    // Also keeps the 15-minute access token alive while a tab is open, so an
    // idle operator doesn't get bounced through the refresh redirect.
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bare]);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    window.location.href = "/login";
  }

  // The login page owns its own full-page layout.
  if (bare) return <>{children}</>;

  const sections = user?.role === "superadmin"
    ? [...BASE_SECTIONS, TEAM_SECTION]
    : BASE_SECTIONS;
  const current = sections.flatMap((s) => s.items).find((i) => i.href === pathname);
  const workerOk = settings?.playwright_session_valid ?? null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--page)" }}>
      {/* The full Instagram gradient, used where nothing sits on top of it. */}
      <div
        className="fixed inset-x-0 top-0 z-50 h-[3px]"
        style={{ backgroundImage: "var(--brand-gradient-vivid)" }}
        aria-hidden
      />

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[228px] flex-col border-r transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex h-14 items-center gap-2.5 border-b px-4" style={{ borderColor: "var(--border)" }}>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-[8px] text-[13px] font-bold"
            style={{ backgroundImage: "var(--brand-gradient)", color: "#ffffff" }}
          >
            G
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight" style={{ color: "var(--ink)" }}>
              Ghaslet
            </p>
            <p className="truncate text-[10px] leading-tight" style={{ color: "var(--ink-muted)" }}>
              Instagram CRM
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              <p
                className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--ink-muted)" }}
              >
                {section.title}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150 active:scale-[0.97]"
                      style={{
                        background: active ? "var(--accent-soft)" : "transparent",
                        color: active ? "var(--accent)" : "var(--ink-secondary)",
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Worker status — the one piece of state worth showing on every page. */}
        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div
            className="flex items-center gap-2 rounded-[8px] px-2.5 py-2"
            style={{ background: "var(--surface-2)" }}
          >
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
              style={{
                background:
                  workerOk === null ? "var(--ink-muted)" : workerOk ? "var(--good)" : "var(--critical)",
              }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium" style={{ color: "var(--ink)" }}>
                {workerOk === null ? "Worker unknown" : workerOk ? "Worker connected" : "Session expired"}
              </p>
              <p className="truncate text-[10px]" style={{ color: "var(--ink-muted)" }}>
                {settings?.playwright_last_poll_at
                  ? `Polled ${new Date(settings.playwright_last_poll_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "No poll recorded"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex h-14 flex-shrink-0 items-center justify-between gap-4 border-b px-4 lg:px-6"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] border transition-all duration-150 active:scale-[0.92] lg:hidden"
              style={{ borderColor: "var(--border)", color: "var(--ink-secondary)" }}
              aria-label="Open navigation"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
            <h1 className="truncate text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
              {current?.label ?? "Ghaslet"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {settings && !settings.use_ai && (
              <span
                className="hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline"
                style={{ background: "var(--warning-soft)", color: "var(--ink)" }}
              >
                AI off
              </span>
            )}
            <ThemeToggle />

            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Account menu"
                className="flex h-8 items-center gap-2 rounded-[8px] border pl-1 pr-2 transition-all duration-150 active:scale-[0.96]"
                style={{ borderColor: "var(--border)" }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {initials(user)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--ink-muted)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
                  <div
                    role="menu"
                    className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-[10px] border"
                    style={{
                      background: "var(--surface)",
                      borderColor: "var(--border-strong)",
                      boxShadow: "var(--shadow)",
                    }}
                  >
                    <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
                      <p className="truncate text-[13px] font-medium" style={{ color: "var(--ink)" }}>
                        {user?.name || user?.email || "Signed in"}
                      </p>
                      {user?.name && (
                        <p className="truncate text-[11px]" style={{ color: "var(--ink-muted)" }}>
                          {user.email}
                        </p>
                      )}
                      {user && (
                        <span className="mt-1.5 inline-block">
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={
                              user.role === "superadmin"
                                ? { backgroundImage: "var(--brand-gradient)", color: "#ffffff" }
                                : { background: "var(--surface-active)", color: "var(--ink-secondary)" }
                            }
                          >
                            {ROLE_LABEL[user.role]}
                          </span>
                        </span>
                      )}
                    </div>
                    <button
                      role="menuitem"
                      onClick={signOut}
                      className="w-full px-3 py-2.5 text-left text-[13px] transition-all duration-150 active:scale-[0.97] hover:bg-[var(--surface-hover)]"
                      style={{ color: "var(--ink)" }}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <SessionProvider value={user}>{children}</SessionProvider>
        </main>
      </div>
    </div>
  );
}

"use client";

import React from "react";

/* ---------------------------------------------------------------- surfaces */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] border ${padded ? "p-5" : ""} ${className}`}
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--ink)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm" style={{ color: "var(--ink-secondary)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */

export type Tone =
  | "neutral"
  | "accent"
  | "good"
  | "warning"
  | "critical"
  | "cat-1"
  | "cat-2"
  | "cat-3";

const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: "var(--ink-secondary)", bg: "var(--surface-active)" },
  accent: { fg: "var(--accent)", bg: "var(--accent-soft)" },
  good: { fg: "var(--good-ink)", bg: "var(--good-soft)" },
  warning: { fg: "var(--ink)", bg: "var(--warning-soft)" },
  critical: { fg: "var(--critical)", bg: "var(--critical-soft)" },
  "cat-1": { fg: "var(--cat-1)", bg: "var(--cat-1-soft)" },
  "cat-2": { fg: "var(--cat-2)", bg: "var(--cat-2-soft)" },
  "cat-3": { fg: "var(--cat-3)", bg: "var(--cat-3-soft)" },
};

/**
 * Every badge carries a text label — colour never carries meaning alone. That
 * also supplies the relief the light-mode aqua slot needs (sub-3:1 vs surface).
 */
export function Badge({
  children,
  tone = "neutral",
  dot = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  const { fg, bg } = TONES[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: fg, background: bg }}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
          style={{ background: fg }}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- buttons */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  style,
  ...props
}: ButtonProps) {
  const sizing = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-[13px]";

  const variants: Record<string, React.CSSProperties> = {
    // The text-safe brand gradient, not the vivid one — white has to stay
    // legible from end to end.
    primary: { backgroundImage: "var(--brand-gradient)", color: "#ffffff", borderColor: "transparent" },
    secondary: { background: "var(--surface)", color: "var(--ink)", borderColor: "var(--border-strong)" },
    ghost: { background: "transparent", color: "var(--ink-secondary)", borderColor: "transparent" },
    danger: { background: "transparent", color: "var(--critical)", borderColor: "var(--border-strong)" },
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-[8px] border font-medium transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40 ${sizing} ${className}`}
      style={{ ...variants[variant], ...style }}
    />
  );
}

/* ------------------------------------------------------------------ inputs */

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", style, ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded-[8px] border px-3 py-1.5 text-[13px] outline-none transition-colors placeholder:opacity-50 focus:border-[var(--accent)] ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--ink)", ...style }}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", style, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full resize-y rounded-[8px] border px-3 py-1.5 text-[13px] outline-none transition-colors placeholder:opacity-50 focus:border-[var(--accent)] ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--ink)", ...style }}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", style, ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full rounded-[8px] border px-3 py-1.5 text-[13px] outline-none transition-colors focus:border-[var(--accent)] ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border-strong)", color: "var(--ink)", ...style }}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--ink)" }}>
        {label}
      </span>
      {hint && (
        <span className="-mt-1 text-xs" style={{ color: "var(--ink-muted)" }}>
          {hint}
        </span>
      )}
      {children}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  // Explicit box-sizing and `left` rather than relying on an absolutely
  // positioned element's static position — that put the knob outside the track.
  const W = 36;
  const H = 20;
  const KNOB = 16;
  const INSET = 2;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative flex-shrink-0 rounded-full transition-colors"
      style={{
        width: W,
        height: H,
        boxSizing: "border-box",
        backgroundColor: checked ? "transparent" : "var(--surface-2)",
        backgroundImage: checked ? "var(--brand-gradient)" : "none",
        boxShadow: checked ? "none" : "inset 0 0 0 1px var(--border-strong)",
      }}
    >
      <span
        className="absolute rounded-full bg-white transition-transform"
        style={{
          top: INSET,
          left: INSET,
          width: KNOB,
          height: KNOB,
          transform: `translateX(${checked ? W - KNOB - INSET * 2 : 0}px)`,
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ tables */

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`whitespace-nowrap border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
      style={{ color: "var(--ink-muted)", borderColor: "var(--border)" }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`border-b px-4 py-3 align-middle ${align === "right" ? "text-right" : ""} ${className}`}
      style={{ borderColor: "var(--border)", color: "var(--ink-secondary)" }}
    >
      {children}
    </td>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-16 text-center">
      <p className="text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
        {title}
      </p>
      {hint && (
        <p className="max-w-sm text-xs" style={{ color: "var(--ink-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ avatar */

export function Avatar({
  src,
  name,
  fallback,
  size = 32,
}: {
  src?: string | null;
  name?: string | null;
  fallback: string;
  size?: number;
}) {
  const initials = name ? name.slice(0, 2).toUpperCase() : fallback.slice(-2).toUpperCase();

  return (
    <div
      className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        minWidth: size,
        fontSize: size * 0.36,
        background: "var(--surface-2)",
        color: "var(--ink-secondary)",
        border: "1px solid var(--border)",
      }}
    >
      {src ? (
        // Instagram CDN URLs expire; next/image adds no value and its loader
        // fails noisily on dead URLs, so a plain img with a graceful fallback.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || fallback}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        initials
      )}
    </div>
  );
}

/* -------------------------------------------------------------- stat tiles */

/**
 * Stat tile: label · value · optional delta · optional 12-point sparkline.
 * The value keeps proportional figures; only table columns get tabular-nums.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  upIsGood = true,
  trend,
  footer,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  deltaLabel?: string;
  upIsGood?: boolean;
  trend?: number[];
  footer?: React.ReactNode;
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta) && delta !== 0;
  const good = hasDelta ? (delta! > 0) === upIsGood : false;

  return (
    <Card>
      <p className="text-xs font-medium" style={{ color: "var(--ink-muted)" }}>
        {label}
      </p>

      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-[28px] font-semibold leading-none" style={{ color: "var(--ink)" }}>
          {value}
        </span>
        {trend && trend.length > 1 && <Sparkline points={trend} />}
      </div>

      {(hasDelta || deltaLabel || footer) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {hasDelta && (
            <span
              className="inline-flex items-center gap-0.5 font-medium"
              style={{ color: good ? "var(--good-ink)" : "var(--critical)" }}
            >
              <span aria-hidden>{delta! > 0 ? "↑" : "↓"}</span>
              {Math.abs(delta!)}
            </span>
          )}
          {deltaLabel && <span style={{ color: "var(--ink-muted)" }}>{deltaLabel}</span>}
          {footer}
        </div>
      )}
    </Card>
  );
}

/** 12-point sparkline: context in the de-emphasis hue, current period in accent. */
function Sparkline({ points }: { points: number[] }) {
  const data = points.slice(-12);
  const max = Math.max(...data, 1);
  const w = 68;
  const h = 26;
  const gap = 2;
  const barW = (w - gap * (data.length - 1)) / data.length;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Recent trend" className="flex-shrink-0">
      {data.map((v, i) => {
        const barH = Math.max(2, (v / max) * h);
        const isLast = i === data.length - 1;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={h - barH}
            width={barW}
            height={barH}
            rx={Math.min(2, barW / 2)}
            fill={isLast ? "var(--accent)" : "var(--deemphasis)"}
          />
        );
      })}
    </svg>
  );
}

/* ----------------------------------------------------------------- helpers */

export function formatRelative(dateStr: string): string {
  const then = new Date(dateStr).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60_000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

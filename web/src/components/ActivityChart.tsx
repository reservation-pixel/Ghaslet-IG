"use client";

import { useState } from "react";
import type { DayBucket } from "@/app/api/stats/route";
import { Table, Td, Th } from "@/components/ui";

/**
 * Daily event volume, split by type.
 *
 * Stacked bar: part-to-whole over time. Three categorical series (validated
 * all-pairs in both modes), so a legend is always present and the tooltip
 * names each series — identity is never colour-alone. A table view is
 * available, which also supplies the relief the light-mode aqua slot needs.
 */

const SERIES = [
  { key: "follow", label: "Followers", color: "var(--cat-1)" },
  { key: "like", label: "Likes", color: "var(--cat-2)" },
  { key: "comment", label: "Comments", color: "var(--cat-3)" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

export default function ActivityChart({ data }: { data: DayBucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const totals = data.map((d) => d.follow + d.like + d.comment);
  const peak = Math.max(...totals, 1);
  // Round the axis up to a clean step so the top gridline is a readable number.
  const step = peak <= 5 ? 1 : peak <= 20 ? 5 : peak <= 50 ? 10 : 25;
  const max = Math.ceil(peak / step) * step;

  const H = 168;
  const grid = [0, 0.5, 1].map((f) => Math.round(max * f));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Legend — always present for >= 2 series. */}
        <div className="flex flex-wrap items-center gap-3.5">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-secondary)" }}>
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium underline-offset-2 transition-all duration-150 active:scale-[0.96] hover:underline"
          style={{ color: "var(--ink-muted)" }}
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <div className="max-h-[240px] overflow-y-auto">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                {SERIES.map((s) => (
                  <Th key={s.key} align="right">
                    {s.label}
                  </Th>
                ))}
                <Th align="right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.date}>
                  <Td className="tabular">{formatDay(d.date)}</Td>
                  {SERIES.map((s) => (
                    <Td key={s.key} align="right" className="tabular">
                      {d[s.key as SeriesKey]}
                    </Td>
                  ))}
                  <Td align="right" className="tabular font-medium">
                    {totals[i]}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <div className="relative">
          {/* Gridlines + axis labels */}
          <div className="relative" style={{ height: H }}>
            {grid.map((value, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 flex items-center gap-2"
                style={{ bottom: (i / (grid.length - 1)) * H, transform: "translateY(50%)" }}
              >
                <span
                  className="tabular w-6 flex-shrink-0 text-right text-[10px]"
                  style={{ color: "var(--ink-muted)" }}
                >
                  {value}
                </span>
                <span className="h-px flex-1" style={{ background: "var(--gridline)" }} />
              </div>
            ))}

            {/* Bars */}
            <div className="absolute inset-0 flex items-end gap-[3px] pl-8">
              {data.map((d, i) => {
                const total = totals[i];
                const active = hover === i;

                return (
                  <div
                    key={d.date}
                    className="group relative flex h-full flex-1 cursor-default flex-col justify-end"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    {/* Hover hit target is the whole column, not just the bar. */}
                    <div
                      className="absolute inset-0 rounded-[4px] transition-colors"
                      style={{ background: active ? "var(--surface-hover)" : "transparent" }}
                    />

                    {total === 0 ? (
                      <div
                        className="relative h-[2px] w-full rounded-[1px]"
                        style={{ background: "var(--gridline)" }}
                      />
                    ) : (
                      <div className="relative flex w-full flex-col-reverse">
                        {SERIES.map((s, si) => {
                          const value = d[s.key as SeriesKey];
                          if (value === 0) return null;
                          const isTop =
                            SERIES.slice(si + 1).every((rest) => d[rest.key as SeriesKey] === 0);
                          return (
                            <div
                              key={s.key}
                              style={{
                                height: Math.max(3, (value / max) * H),
                                background: s.color,
                                // 4px rounded data-end on the top segment only;
                                // the stack stays anchored to the baseline.
                                borderRadius: isTop ? "4px 4px 0 0" : 0,
                                // 2px surface gap between stacked segments.
                                marginTop: si === 0 ? 0 : 2,
                              }}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Tooltip */}
            {hover !== null && totals[hover] > 0 && (
              <div
                className="pointer-events-none absolute z-10 min-w-[130px] rounded-[8px] border p-2.5 text-xs shadow-lg"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border-strong)",
                  // Inside the plot, not above it — floating above would cover
                  // the legend, and the legend has to stay readable.
                  top: 4,
                  left: `calc(2rem + ${((hover + 0.5) / data.length) * 100}%)`,
                  transform: `translateX(${hover > data.length / 2 ? "-100%" : "-50%"})`,
                }}
              >
                <p className="mb-1.5 font-semibold" style={{ color: "var(--ink)" }}>
                  {formatDay(data[hover].date)}
                </p>
                {SERIES.map((s) => (
                  <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
                    <span className="flex items-center gap-1.5" style={{ color: "var(--ink-secondary)" }}>
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                      {s.label}
                    </span>
                    <span className="tabular font-medium" style={{ color: "var(--ink)" }}>
                      {data[hover][s.key as SeriesKey]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* X axis — label the ends and the midpoint, not every bar. */}
          <div className="mt-2 flex pl-8">
            {data.map((d, i) => {
              const show = i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2);
              return (
                <span
                  key={d.date}
                  className="flex-1 text-center text-[10px]"
                  style={{ color: "var(--ink-muted)" }}
                >
                  {show ? formatDay(d.date) : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

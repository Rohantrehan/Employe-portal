"use client";

import { useState } from "react";
import { formatTick, formatValue, niceTicks, type Unit } from "./chart-utils";
import { ChartTooltip } from "./tooltip";
import { useWidth } from "./use-width";

export type LineSeries = { key: string; name: string; color: string };
export type LineRow = { label: string; short?: string; values: Record<string, number> };

const PAD = { top: 14, right: 76, bottom: 26, left: 36 };

/** Multi-series lines on ONE shared axis, with a crosshair tooltip, legend and end labels. */
export function LineChart({
  series,
  rows,
  unit,
  height = 260,
  label,
}: {
  series: LineSeries[];
  rows: LineRow[];
  unit: Unit;
  height?: number;
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(0, ...rows.flatMap((r) => series.map((s) => r.values[s.key] ?? 0)));
  const ticks = niceTicks(max, 4, unit === "count");
  const top = ticks[ticks.length - 1];
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const step = rows.length > 1 ? innerW / (rows.length - 1) : 0;
  const x = (i: number) => PAD.left + (rows.length > 1 ? step * i : innerW / 2);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const every = Math.max(1, Math.ceil(rows.length / Math.max(1, Math.floor(innerW / 48))));

  // End labels: nudge apart so they never overlap.
  const ends = series
    .map((s) => ({ s, y: y(rows.at(-1)?.values[s.key] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;

  const onMove = (clientX: number, rectLeft: number) => {
    if (!rows.length) return;
    const i = Math.round((clientX - rectLeft - PAD.left) / (step || 1));
    setHover(Math.min(rows.length - 1, Math.max(0, i)));
  };

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-body" aria-label="Legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
      <div
        ref={ref}
        className="relative w-full touch-pan-y select-none"
        style={{ height }}
        onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect().left)}
        onTouchMove={(e) => onMove(e.touches[0].clientX, e.currentTarget.getBoundingClientRect().left)}
        onMouseLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + innerW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#d1d5db" : "#eef0f3"} shapeRendering="crispEdges" />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-body text-[11px] tabular-nums">
                  {formatTick(t, unit)}
                </text>
              </g>
            ))}
            {rows.map((r, i) =>
              (rows.length - 1 - i) % every === 0 ? (
                <text key={r.label} x={x(i)} y={height - 8} textAnchor="middle" className="fill-body text-[11px]">
                  {r.short ?? r.label}
                </text>
              ) : null,
            )}

            {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="#9ca3af" shapeRendering="crispEdges" />}

            {series.map((s) => (
              <path
                key={s.key}
                d={rows.map((r, i) => `${i ? "L" : "M"}${x(i)},${y(r.values[s.key] ?? 0)}`).join("")}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {hover != null &&
              series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(rows[hover].values[s.key] ?? 0)} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
              ))}

            {ends.map(({ s, y: ly }) => (
              <text key={s.key} x={PAD.left + innerW + 8} y={ly} dy="0.32em" className="fill-ink text-[11px] font-semibold">
                {s.name}
              </text>
            ))}
          </svg>
        )}

        {hover != null && rows[hover] && (
          <ChartTooltip
            x={x(hover)}
            y={PAD.top}
            width={width}
            title={rows[hover].label}
            rows={series.map((s) => ({ label: s.name, value: formatValue(rows[hover].values[s.key] ?? 0, unit), color: s.color }))}
          />
        )}
      </div>
    </div>
  );
}

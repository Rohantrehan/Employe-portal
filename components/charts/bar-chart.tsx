"use client";

import { useState } from "react";
import { BRAND, barPath, formatTick, formatValue, niceTicks, type Unit } from "./chart-utils";
import { ChartTooltip } from "./tooltip";
import { useWidth } from "./use-width";

export type BarDatum = {
  /** Full label, used in the tooltip ("March 2026"). */
  label: string;
  /** Axis label ("Mar"). Defaults to label. */
  short?: string;
  value: number;
  /** Extra tooltip lines. */
  extra?: { label: string; value: string }[];
  /** Draw lighter (e.g. a day still in progress, or the current month). */
  muted?: boolean;
  /** Text shown in place of a bar when there is no value (e.g. "Off"). */
  placeholder?: string;
};

const PAD = { top: 12, right: 12, bottom: 26, left: 44 };

/** Single-series vertical bars with optional target line and hover tooltip. */
export function BarChart({
  data,
  unit,
  height = 220,
  color = BRAND,
  target,
  label,
}: {
  data: BarDatum[];
  unit: Unit;
  height?: number;
  color?: string;
  target?: { value: number; label: string };
  label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(target?.value ?? 0, ...data.map((d) => d.value));
  const ticks = niceTicks(max, 4, unit === "count");
  const top = ticks[ticks.length - 1];
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(2, Math.min(28, band * 0.62));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 44))));

  const h = hover != null ? data[hover] : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#d1d5db" : "#eef0f3"} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-body text-[11px] tabular-nums">
                {formatTick(t, unit)}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const bh = (d.value / top) * innerH;
            const dim = hover != null && hover !== i;
            return (
              <g key={d.label + i}>
                {d.value > 0 ? (
                  <path
                    d={barPath(cx - barW / 2, y(d.value), barW, bh)}
                    fill={color}
                    opacity={(d.muted ? 0.4 : 1) * (dim ? 0.45 : 1)}
                    style={{ transition: "opacity .2s" }}
                  />
                ) : (
                  d.placeholder && (
                    <text x={cx} y={y(0) - 6} textAnchor="middle" className="fill-body text-[9px] font-semibold uppercase">
                      {d.placeholder}
                    </text>
                  )
                )}
                {(data.length - 1 - i) % every === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" className={hover === i ? "fill-ink text-[11px] font-bold" : "fill-body text-[11px]"}>
                    {d.short ?? d.label}
                  </text>
                )}
                {/* Hit target: the whole column, much bigger than the bar */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                />
              </g>
            );
          })}

          {target && (
            <g pointerEvents="none">
              <line x1={PAD.left} x2={width - PAD.right} y1={y(target.value)} y2={y(target.value)} stroke="#111827" strokeWidth={1.25} strokeDasharray="4 4" />
              <text x={width - PAD.right} y={y(target.value) - 6} textAnchor="end" className="fill-ink text-[11px] font-bold">
                {target.label}
              </text>
            </g>
          )}
        </svg>
      )}

      {h && hover != null && (
        <ChartTooltip
          x={PAD.left + band * hover + band / 2}
          y={y(h.value) - 20}
          width={width}
          title={h.label}
          rows={[{ label: "Value", value: h.value > 0 || !h.placeholder ? formatValue(h.value, unit) : h.placeholder, color }, ...(h.extra ?? [])]}
        />
      )}
    </div>
  );
}

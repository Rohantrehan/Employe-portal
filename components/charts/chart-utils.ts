import { formatINR } from "@/lib/format";

/** What a number means. Decides how values are printed on axes and in tooltips. */
export type Unit = "count" | "days" | "hours" | "inr" | "percent";

/** Fixed series colours (validated: colour-blind safe, all pairs, on white). Assigned by meaning, never by rank. */
export const SERIES = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
} as const;

/** Single-series bars use the brand colour. */
export const BRAND = "#d4000f";

/** Sequential ramp (one hue, light → dark) for magnitude, e.g. hours worked. */
export const BLUE_RAMP = ["#cde2fb", "#86b6ef", "#3987e5", "#1c5cab"] as const;

const trim = (n: number, dp = 1) => {
  const s = n.toFixed(dp);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
};

/** Full value for tooltips and tables. */
export function formatValue(v: number, unit: Unit) {
  switch (unit) {
    case "inr":
      return formatINR(v);
    case "hours":
      return `${trim(v, 2)}h`;
    case "days":
      return `${trim(v)} ${Math.abs(v) === 1 ? "day" : "days"}`;
    case "percent":
      return `${Math.round(v)}%`;
    default:
      return String(Math.round(v * 10) / 10);
  }
}

/** Short value for axis ticks: ₹1.2L, ₹45k, 7.5h. */
export function formatTick(v: number, unit: Unit) {
  if (unit === "inr") {
    if (v >= 1e7) return `₹${trim(v / 1e7)}Cr`;
    if (v >= 1e5) return `₹${trim(v / 1e5)}L`;
    if (v >= 1e3) return `₹${trim(v / 1e3)}k`;
    return `₹${trim(v, 0)}`;
  }
  if (unit === "hours") return `${trim(v)}h`;
  if (unit === "percent") return `${Math.round(v)}%`;
  return trim(v);
}

/** 0-based "nice" axis ticks covering max (at least one step). */
export function niceTicks(max: number, target = 4, integer = false) {
  const safe = max > 0 ? max : 1;
  const raw = safe / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(safe / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step / 1000; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

/** Path for a bar with rounded top corners only (data end), flat on the baseline. */
export function barPath(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

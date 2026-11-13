import type { BadgeTone } from "@/components/ui/badge";

export type HolidayType = "company" | "festival" | "floating";
export type Holiday = { id: string; date: string; name: string; type: HolidayType };
export type SwapStatus = "pending" | "approved" | "rejected" | "cancelled";

export const HOLIDAY_TYPES: Record<HolidayType, { label: string; tone: BadgeTone; hint: string }> = {
  festival: { label: "Festival", tone: "brand", hint: "Office closed for everyone." },
  company: { label: "Company", tone: "info", hint: "Office closed for everyone." },
  floating: { label: "Floating", tone: "dark", hint: "Off by default. Employees can ask to move it to another working day." },
};

export const SWAP_STATUS: Record<SwapStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "brand" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const utc = (d: string) => new Date(d + "T00:00:00Z");

export const weekday = (d: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat("en-GB", { weekday: style, timeZone: "UTC" }).format(utc(d));

export const monthName = (d: string) => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(utc(d));

export const isSunday = (d: string) => utc(d).getUTCDay() === 0;

/** Whole days from a to b (both "YYYY-MM-DD"). */
export const daysBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);

/** Group items by calendar month of their `date`, in order. */
export function groupByMonth<T extends { date: string }>(items: T[]) {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const it of items) {
    const key = it.date.slice(0, 7);
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, label: monthName(it.date), items: [] }));
    g.items.push(it);
  }
  return groups;
}

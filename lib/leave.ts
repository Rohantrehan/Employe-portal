import type { BadgeTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export type DayPart = "full" | "first_half" | "second_half";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveType = {
  id: string;
  code: string;
  name: string;
  is_paid: boolean;
  tracks_balance: boolean;
  requires_attachment: boolean;
  color: string;
  is_active: boolean;
  sort_order: number;
};

export type Balance = { leave_type_id: string; allotted: number; carried: number; used: number; pending: number };

export const LEAVE_STATUS: Record<LeaveStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "brand" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const DAY_PART: Record<DayPart, string> = {
  full: "Full day",
  first_half: "First half",
  second_half: "Second half",
};

/** "1 day", "0.5 day", "3.5 days" */
export function formatDays(n: number | string) {
  const v = Number(n);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${s} ${v === 1 || v === 0.5 ? "day" : "days"}`;
}

/** "07 Dec 2026", "07 Dec 2026 · First half", "07 Dec – 12 Dec 2026" */
export function formatRange(start: string, end: string, part: DayPart = "full") {
  if (start === end) return part === "full" ? formatDate(start) : `${formatDate(start)} · ${DAY_PART[part]}`;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const s = formatDate(start);
  return `${sameYear ? s.slice(0, -5) : s} – ${formatDate(end)}`;
}

export const remaining = (b: Balance) => Number(b.allotted) + Number(b.carried) - Number(b.used) - Number(b.pending);
export const total = (b: Balance) => Number(b.allotted) + Number(b.carried);

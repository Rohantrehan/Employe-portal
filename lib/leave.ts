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
  /** null = days per calendar year; a number = days per contract */
  contract_quota: number | null;
};

export type BalanceState = "year" | "current" | "upcoming" | "ended";

export type Balance = {
  leave_type_id: string;
  allotted: number;
  carried: number;
  used: number;
  pending: number;
  balance_id?: string | null;
  used_before?: number;
  set_by_hr?: boolean;
  contract_id?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  state?: BalanceState;
  carried_from_end?: string | null;
};

export type BalanceOn = Balance & { employee_id: string };

type Rpc = { rpc: (fn: "leave_balances_on", args: { p_on: string; p_employee?: string | null }) => PromiseLike<{ data: unknown }> };

/** Balances as of a date: the contract covering it for contract types, else the calendar year. */
export async function balancesOn(supabase: unknown, on: string, employeeId?: string): Promise<BalanceOn[]> {
  const { data } = await (supabase as Rpc).rpc("leave_balances_on", { p_on: on, p_employee: employeeId ?? null });
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    employee_id: r.employee_id as string,
    leave_type_id: r.leave_type_id as string,
    balance_id: (r.balance_id as string | null) ?? null,
    allotted: Number(r.allotted ?? 0),
    carried: Number(r.carried ?? 0),
    used: Number(r.used ?? 0),
    pending: Number(r.pending ?? 0),
    used_before: Number(r.used_before ?? 0),
    set_by_hr: !!r.set_by_hr,
    contract_id: (r.contract_id as string | null) ?? null,
    starts_on: (r.starts_on as string | null) ?? null,
    ends_on: (r.ends_on as string | null) ?? null,
    state: r.state as BalanceState,
    carried_from_end: (r.carried_from_end as string | null) ?? null,
  }));
}

/** "Contract 1 Jan – 30 Jun 2027" style line for a contract balance; null for yearly ones. */
export function periodText(b: Pick<Balance, "state" | "starts_on" | "ends_on">) {
  if (!b.state || b.state === "year" || !b.starts_on || !b.ends_on) return null;
  const range = formatRange(b.starts_on, b.ends_on);
  if (b.state === "ended") return `Contract ended ${formatDate(b.ends_on)}`;
  if (b.state === "upcoming") return `Next contract ${range}`;
  return `Contract ${range}`;
}

/** Days left that can actually be used: an ended contract has none until it's renewed. */
export const usable = (b: Balance) => (b.state === "ended" ? 0 : remaining(b));

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

import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ChevronLeft, ChevronRight, Send, Users, Wallet } from "lucide-react";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { requireRole } from "@/lib/auth";
import { formatINR, todayIST } from "@/lib/format";
import { monthLabel, shiftMonth } from "@/lib/overtime";
import type { PaymentStatus, PayslipStatus } from "@/lib/payroll";
import { PayrollSheet, type PayrollRow } from "./payroll-sheet";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase } = await requireRole("admin");
  const today = todayIST();
  const current = today.slice(0, 7);
  const { month: m } = await searchParams;
  // Default to last month: payroll is usually prepared after the month ends.
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= current ? m : shiftMonth(current, -1);

  const { data, error } = await supabase.rpc("payroll_month", { p_month: `${month}-01` });
  const rows: PayrollRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    employeeId: r.employee_id as string,
    name: r.full_name as string,
    empCode: r.emp_code as string,
    designation: (r.designation as string | null) ?? null,
    avatar: (r.avatar_url as string | null) ?? null,
    isActive: r.is_active as boolean,
    // Marked only in the month they leave (their final payslip).
    leftOn: typeof r.left_on === "string" && r.left_on.startsWith(month) ? r.left_on : null,
    profileBasic: Number(r.profile_basic ?? 0),
    workingDays: Number(r.working_days ?? 0),
    presentDays: Number(r.present_days ?? 0),
    leaveDays: Number(r.leave_days ?? 0),
    overtimeHours: Number(r.overtime_hours ?? 0),
    payslipId: (r.payslip_id as string | null) ?? null,
    basic: r.basic_salary == null ? null : Number(r.basic_salary),
    lateDays: Number(r.late_days ?? 0),
    excellence: r.excellence_bonus == null ? null : Number(r.excellence_bonus),
    rating: r.rating == null ? null : Number(r.rating),
    bonus: r.performance_bonus == null ? null : Number(r.performance_bonus),
    night: r.night_shift_pay == null ? null : Number(r.night_shift_pay),
    remarks: (r.remarks as string | null) ?? "",
    net: r.net_pay == null ? null : Number(r.net_pay),
    status: (r.status as PayslipStatus | null) ?? null,
    paymentStatus: (r.payment_status as PaymentStatus | null) ?? null,
    paidOn: (r.paid_on as string | null) ?? null,
    paymentRef: (r.payment_ref as string | null) ?? null,
  }));

  const saved = rows.filter((r) => r.payslipId);
  const published = rows.filter((r) => r.status === "published");
  const paid = rows.filter((r) => r.paymentStatus === "paid");
  const total = saved.reduce((s, r) => s + (r.net ?? 0), 0);

  const navBtn = "grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink transition-colors hover:bg-app";
  const href = (mm: string) => `/admin/payroll?month=${mm}`;

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Payroll"
        description="Net pay = Basic + Excellence bonus + Performance bonus + Night shift pay. The performance bonus comes from the rating: (Basic + Excellence) × (multiplier − 1)."
        actions={
          <div className="flex items-center gap-2">
            <Link href={href(shiftMonth(month, -1))} className={navBtn} aria-label="Previous month">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <span className="min-w-36 text-center text-lg font-extrabold text-ink">{monthLabel(month)}</span>
            <Link href={href(shiftMonth(month, 1))} className={cn(navBtn, month >= current && "pointer-events-none opacity-40")} aria-label="Next month">
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>
        }
      />

      {error && <p className="mt-6 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">Could not load payroll for this month.</p>}

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Employees" value={rows.length} sub={`${saved.length} with a payslip`} icon={<Users />} tone="dark" />
        <StatTile label="Total net pay" value={formatINR(total)} sub="Saved payslips" icon={<Wallet />} tone="brand" />
        <StatTile label="Published" value={`${published.length} / ${rows.length}`} sub="Visible to employees" icon={<Send />} tone="info" />
        <StatTile label="Paid" value={`${paid.length} / ${published.length || 0}`} sub="Of published" icon={<BadgeCheck />} tone="success" />
      </div>

      <div className="mt-6">
        <PayrollSheet key={month} rows={rows} month={month} today={today} isCurrentMonth={month === current} />
      </div>
    </>
  );
}

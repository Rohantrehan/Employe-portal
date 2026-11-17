import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, CalendarClock, ClipboardCheck, Palmtree, UserX, Users } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { BarList, ChartCard, Headline } from "@/components/charts/chart-card";
import { SERIES, formatValue } from "@/components/charts/chart-utils";
import { LineChart } from "@/components/charts/line-chart";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatDate, formatINR } from "@/lib/format";
import { monthTitle } from "@/lib/payroll";

export const metadata: Metadata = { title: "Dashboard" };

type Dashboard = {
  today: string;
  year: number;
  kpis: { headcount: number; working: number; clocked_out: number; on_leave: number; not_in: number; off_today: number; late: number };
  pending: { leaves: number; overtime: number; swaps: number };
  trend: { d: string; expected: number; present: number; late: number; on_leave: number }[];
  leave_by_type: { name: string; code: string; days: number }[];
  leave_by_month: { m: number; days: number }[];
  avg_hours: { full_name: string; hours: number; days: number }[];
  avg_hours_month: number | null;
  overtime_by_month: { m: number; hours: number }[];
  payroll_by_month: { month: string; total: number; slips: number; published: number; paid: number }[];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortDate = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const sum = (xs: number[]) => xs.reduce((a, b) => a + Number(b), 0);

export default async function AdminDashboard() {
  const { supabase, profile } = await requireRole("admin");
  const [{ data, error }, { count: fixCount }] = await Promise.all([
    supabase.rpc("admin_dashboard"),
    supabase.from("clockout_fix_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const fixes = fixCount ?? 0;
  const d = data as Dashboard | null;

  if (error || !d) {
    return (
      <>
        <PageHeader eyebrow="Admin panel" title={`Welcome, ${profile.full_name.split(" ")[0]}.`} />
        <p className="mt-8 text-sm text-brand">Could not load the dashboard: {error?.message ?? "no data"}</p>
      </>
    );
  }

  const k = d.kpis;
  const currentMonth = Number(d.today.slice(5, 7));
  const pendingTotal = d.pending.leaves + d.pending.overtime + d.pending.swaps + fixes;
  const expectedToday = k.headcount - k.off_today - k.on_leave;

  // Trend: skip days nobody was expected (Sundays, company holidays).
  const trend = d.trend.filter((t) => t.expected > 0 || t.present > 0);
  const trendExpected = sum(trend.map((t) => t.expected));
  const rate = trendExpected ? Math.round((sum(trend.map((t) => t.present)) / trendExpected) * 100) : null;

  const months = d.leave_by_month.filter((m) => m.m <= currentMonth);
  const otMonths = d.overtime_by_month.filter((m) => m.m <= currentMonth);
  const leaveYear = sum(d.leave_by_type.map((t) => t.days));
  const otYear = sum(otMonths.map((m) => m.hours));
  const payroll = d.payroll_by_month.map((p) => ({ ...p, total: Number(p.total) }));
  const payrollYear = sum(payroll.filter((p) => p.month.startsWith(String(d.year))).map((p) => p.total));

  return (
    <>
      <PageHeader
        eyebrow="Admin panel"
        title={`Welcome, ${profile.full_name.split(" ")[0]}.`}
        description={`Company-wide view of attendance, leave and payroll · ${formatDate(d.today)}`}
      />

      {/* ---------- Today ---------- */}
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Link href="/admin/today" className="block">
          <StatTile
            label="Working now"
            value={
              <>
                {k.working}
                <span className="text-lg font-bold text-body"> / {Math.max(expectedToday, 0)}</span>
              </>
            }
            sub={`${k.clocked_out} clocked out · ${k.late} late today`}
            icon={<BriefcaseBusiness />}
            tone="success"
          />
        </Link>
        <Link href="/admin/today" className="block">
          <StatTile label="Not clocked in" value={k.not_in} sub="Expected today, no clock-in yet" icon={<UserX />} tone={k.not_in ? "warning" : "brand"} />
        </Link>
        <Link href="/admin/leaves" className="block">
          <StatTile label="On leave today" value={k.on_leave} sub={k.off_today ? `${k.off_today} off / holiday` : "Approved leave"} icon={<Palmtree />} tone="info" />
        </Link>
        <Link href={fixes ? "/admin/today" : d.pending.leaves ? "/admin/leaves" : d.pending.overtime ? "/admin/overtime" : "/admin/holidays"} className="block">
          <StatTile
            label="Waiting for you"
            value={pendingTotal}
            sub={`${d.pending.leaves} leave · ${d.pending.overtime} extra hours · ${d.pending.swaps} swaps${fixes ? ` · ${fixes} clock-out` : ""}`}
            icon={<ClipboardCheck />}
            tone={pendingTotal ? "brand" : "dark"}
          />
        </Link>
      </div>

      {/* ---------- Attendance ---------- */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Attendance, last 30 days"
          description="People present, late and on leave each working day"
          headline={rate != null && <Headline value={`${rate}%`} sub="attendance rate (present ÷ expected)" />}
          table={{
            columns: ["Date", "Expected", "Present", "Late", "On leave"],
            rows: trend.map((t) => [formatDate(t.d), t.expected, t.present, t.late, Number(t.on_leave)]),
          }}
        >
          {trend.length ? (
            <LineChart
              label="Attendance over the last 30 days"
              unit="count"
              series={[
                { key: "present", name: "Present", color: SERIES.blue },
                { key: "late", name: "Late", color: SERIES.orange },
                { key: "on_leave", name: "On leave", color: SERIES.aqua },
              ]}
              rows={trend.map((t) => ({
                label: formatDate(t.d),
                short: shortDate(t.d),
                values: { present: t.present, late: t.late, on_leave: Number(t.on_leave) },
              }))}
            />
          ) : (
            <p className="py-16 text-center text-sm text-body">No working days yet.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Average hours per person"
          description="Closed days in the last 30 days"
          headline={<Headline value={d.avg_hours_month != null ? formatValue(Number(d.avg_hours_month), "hours") : "—"} sub="company average this month" />}
          table={{ columns: ["Employee", "Avg hours", "Days"], rows: d.avg_hours.map((a) => [a.full_name, formatValue(Number(a.hours), "hours"), a.days]) }}
        >
          <BarList
            unit="hours"
            items={d.avg_hours.map((a) => ({ label: a.full_name, value: Number(a.hours), note: `${a.days} ${a.days === 1 ? "day" : "days"}` }))}
            target={{ value: 8, label: "8h working day" }}
            empty="No completed days in the last 30 days."
          />
        </ChartCard>
      </div>

      {/* ---------- Leave ---------- */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <ChartCard
          title={`Leave taken in ${d.year}`}
          description="Approved days, by leave type"
          headline={<Headline value={formatValue(leaveYear, "days")} sub="so far this year" />}
          table={{ columns: ["Leave type", "Days"], rows: d.leave_by_type.map((t) => [t.name, Number(t.days)]) }}
          action={
            <Link href="/admin/leaves?tab=balances" className="inline-flex items-center gap-1 text-[12px] font-semibold text-body hover:text-brand">
              Balances <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <BarList unit="days" items={d.leave_by_type.map((t) => ({ label: t.name, value: Number(t.days) }))} />
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          title="Leave by month"
          description={`Approved leave days in ${d.year}, counted on the days they fall`}
          table={{ columns: ["Month", "Days"], rows: months.map((m) => [MONTHS_LONG[m.m - 1], Number(m.days)]) }}
        >
          <BarChart
            label={`Leave days per month in ${d.year}`}
            unit="days"
            data={months.map((m) => ({ label: `${MONTHS_LONG[m.m - 1]} ${d.year}`, short: MONTHS[m.m - 1], value: Number(m.days) }))}
          />
        </ChartCard>
      </div>

      {/* ---------- Extra hours & payroll ---------- */}
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <ChartCard
          title="Extra hours per month"
          description={`Approved extra hours in ${d.year}`}
          headline={<Headline value={formatValue(otYear, "hours")} sub="so far this year" />}
          table={{ columns: ["Month", "Hours"], rows: otMonths.map((m) => [MONTHS_LONG[m.m - 1], formatValue(Number(m.hours), "hours")]) }}
          action={
            <Link href="/admin/overtime" className="inline-flex items-center gap-1 text-[12px] font-semibold text-body hover:text-brand">
              Review <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <BarChart
            label={`Approved extra hours per month in ${d.year}`}
            unit="hours"
            data={otMonths.map((m) => ({ label: `${MONTHS_LONG[m.m - 1]} ${d.year}`, short: MONTHS[m.m - 1], value: Number(m.hours) }))}
          />
        </ChartCard>

        <ChartCard
          title="Payroll cost"
          description="Net pay on saved payslips, last 12 months"
          headline={<Headline value={formatINR(payrollYear)} sub={`net pay on ${d.year} payslips`} />}
          table={{
            columns: ["Month", "Net pay", "Slips", "Paid"],
            rows: payroll.map((p) => [monthTitle(p.month), formatINR(p.total), p.slips, p.paid]),
          }}
          action={
            <Link href="/admin/payroll" className="inline-flex items-center gap-1 text-[12px] font-semibold text-body hover:text-brand">
              Payroll <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <BarChart
            label="Payroll cost per month, last 12 months"
            unit="inr"
            data={payroll.map((p) => ({
              label: monthTitle(p.month),
              short: MONTHS[Number(p.month.slice(5, 7)) - 1],
              value: p.total,
              muted: p.slips > 0 && p.published < p.slips,
              extra: p.slips
                ? [
                    { label: "Payslips", value: String(p.slips) },
                    { label: "Published", value: String(p.published) },
                    { label: "Paid", value: String(p.paid) },
                  ]
                : [],
            }))}
          />
          <p className="mt-2 text-[11.5px] text-body">Lighter bars still have draft payslips.</p>
        </ChartCard>
      </div>

      <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-body">
        <Link href="/admin/employees" className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-brand">
          <Users className="h-4 w-4" /> {k.headcount} active {k.headcount === 1 ? "employee" : "employees"}
        </Link>
        <Link href="/admin/holidays" className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-brand">
          <CalendarClock className="h-4 w-4" /> Holiday calendar
        </Link>
      </p>
    </>
  );
}

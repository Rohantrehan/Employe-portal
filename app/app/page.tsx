import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, CalendarHeart, Clock3, Hourglass, TimerReset } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { ChartCard, Headline } from "@/components/charts/chart-card";
import { BLUE_RAMP } from "@/components/charts/chart-utils";
import { HoursCalendar } from "@/components/charts/hours-calendar";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatDate, todayIST } from "@/lib/format";
import { formatDuration, type DayKind, type DayRecord } from "@/lib/attendance";
import { daysBetween, monthName, weekday } from "@/lib/holidays";
import { formatDays, remaining, total, type Balance } from "@/lib/leave";
import { ClockCard } from "./clock-card";

export const metadata: Metadata = { title: "Dashboard" };

type Recent = { day: string; kind: DayKind; label: string | null; status: string | null; is_late: boolean; open: boolean; minutes: number | null };
type Mine = { today: string; recent: Recent[]; next_holiday: { day: string; label: string } | null };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const PLACEHOLDER: Partial<Record<DayKind, string>> = { weekly_off: "Off", holiday: "Hol", leave: "Leave" };
const PENDING_HATCH = "repeating-linear-gradient(45deg, #9ca3af 0 3px, #e5e7eb 3px 6px)";

export default async function EmployeeDashboard() {
  const { supabase, profile } = await requireRole("employee");
  const today = todayIST();
  const year = Number(today.slice(0, 4));
  const monthStart = today.slice(0, 8) + "01";

  const [{ data: month }, { data: settings }, { data: mine }, { data: balances }, { data: types }] = await Promise.all([
    supabase.rpc("employee_month", { p_employee: profile.id, p_month: monthStart }),
    supabase.from("settings").select("work_start, work_end").single(),
    supabase.rpc("my_dashboard", { p_days: 14 }),
    supabase.from("leave_balances").select("leave_type_id, allotted, carried, used, pending").eq("employee_id", profile.id).eq("year", year),
    supabase.from("leave_types").select("id, name, tracks_balance, is_active, sort_order").eq("is_active", true).eq("tracks_balance", true).order("sort_order"),
  ]);

  const days = (month ?? []) as (DayRecord & { day: string })[];
  const todayRec = days.find((d) => d.day === today);
  const past = days.filter((d) => d.day <= today);
  const workedDays = past.filter((d) => d.clock_in);
  const totalMins = workedDays.reduce((s, d) => s + (d.worked_minutes ?? 0), 0);
  const closedDays = workedDays.filter((d) => d.worked_minutes != null);
  const lateCount = workedDays.filter((d) => d.is_late).length;
  const hhmm = (t?: string) => (t ?? "").slice(0, 5);

  const m = mine as Mine | null;
  const recent = m?.recent ?? [];
  const recentWorked = recent.filter((r) => !r.open && r.minutes != null);
  const recentAvg = recentWorked.length ? recentWorked.reduce((s, r) => s + (r.minutes ?? 0), 0) / recentWorked.length : null;
  const metTarget = recentWorked.filter((r) => (r.minutes ?? 0) >= 480).length;
  const next = m?.next_holiday ?? null;
  const nextIn = next ? daysBetween(today, next.day) : null;

  const balanceRows = (types ?? [])
    .map((t) => {
      const b = (balances ?? []).find((x) => x.leave_type_id === t.id) as Balance | undefined;
      return b ? { name: t.name, total: total(b), used: Number(b.used), pending: Number(b.pending), left: remaining(b) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <>
      <PageHeader
        eyebrow="Employee portal"
        title={`${greeting()}, ${profile.full_name.split(" ")[0]}.`}
        description="Plan your day, clock in and keep track of your time."
      />

      <div className="mt-8">
        {todayRec && <ClockCard today={todayRec} workStart={hhmm(settings?.work_start)} workEnd={hhmm(settings?.work_end)} />}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Days worked" value={workedDays.length} sub="This month" icon={<CalendarCheck />} tone="success" />
        <StatTile label="Hours this month" value={formatDuration(totalMins)} sub="Closed days only" icon={<Clock3 />} tone="dark" />
        <StatTile
          label="Average day"
          value={closedDays.length ? formatDuration(Math.round(totalMins / closedDays.length)) : "—"}
          sub="Target 8h 00m"
          icon={<Hourglass />}
          tone="info"
        />
        <StatTile label="Late arrivals" value={lateCount} sub="This month" icon={<TimerReset />} tone={lateCount ? "warning" : "brand"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Hours, last 14 days"
          description="Time worked each day against the 8-hour target"
          headline={
            <Headline
              value={recentAvg != null ? formatDuration(Math.round(recentAvg)) : "—"}
              sub={recentWorked.length ? `average · target met on ${metTarget} of ${recentWorked.length} days` : "no completed days yet"}
            />
          }
          table={{
            columns: ["Date", "Day", "Worked"],
            rows: recent.map((r) => [
              formatDate(r.day),
              r.label ?? (r.kind === "working" ? "Working day" : r.kind),
              r.minutes != null ? formatDuration(r.minutes) + (r.open ? " (so far)" : "") : "—",
            ]),
          }}
        >
          <BarChart
            label="Hours worked per day over the last 14 days"
            unit="hours"
            color={BLUE_RAMP[2]}
            target={{ value: 8, label: "8h target" }}
            data={recent.map((r) => ({
              label: `${weekday(r.day, "long")}, ${formatDate(r.day)}`,
              short: `${weekday(r.day).slice(0, 2)} ${Number(r.day.slice(8))}`,
              value: r.minutes != null ? Math.round((r.minutes / 60) * 100) / 100 : 0,
              muted: r.open,
              placeholder: PLACEHOLDER[r.kind] ?? (r.day < today && r.kind === "working" ? "—" : undefined),
              extra: [
                ...(r.label ? [{ label: "Day", value: r.label }] : []),
                ...(r.open ? [{ label: "Status", value: "In progress" }] : []),
                ...(r.is_late ? [{ label: "Clock-in", value: "Late" }] : []),
              ],
            }))}
          />
        </ChartCard>

        <ChartCard
          title={`Leave balance ${year}`}
          description="Used, pending and left per leave type"
          action={
            <Link href="/app/leaves" className="inline-flex items-center gap-1 text-[12px] font-semibold text-body hover:text-brand">
              Apply <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
          table={{ columns: ["Type", "Total", "Used", "Pending", "Left"], rows: balanceRows.map((b) => [b.name, b.total, b.used, b.pending, b.left]) }}
        >
          {balanceRows.length ? (
            <ul className="space-y-4">
              {balanceRows.map((b) => {
                const pct = (n: number) => (b.total > 0 ? (n / b.total) * 100 : 0);
                return (
                  <li key={b.name}>
                    <div className="flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="font-semibold text-ink">{b.name}</span>
                      <span className="text-body">
                        <span className="font-bold text-ink">{Number(b.left)}</span> of {formatDays(b.total)} left
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-grey-tile" role="img" aria-label={`${b.name}: ${b.used} used, ${b.pending} pending, ${b.left} left of ${b.total}`}>
                      {b.used > 0 && <span className="h-full rounded-l-full bg-ink" style={{ width: `${pct(b.used)}%` }} />}
                      {b.pending > 0 && <span className="h-full" style={{ width: `${pct(b.pending)}%`, background: PENDING_HATCH }} />}
                    </div>
                  </li>
                );
              })}
              <li className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11.5px] text-body">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-ink" aria-hidden /> Used
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: PENDING_HATCH }} aria-hidden /> Pending
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-grey-tile" aria-hidden /> Left
                </span>
              </li>
            </ul>
          ) : (
            <p className="py-10 text-center text-sm text-body">No leave balances for {year} yet.</p>
          )}
        </ChartCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title={`${monthName(monthStart)} at a glance`}
          description="Each day shaded by hours worked. Hover a day for details."
          action={
            <Link href="/app/attendance" className="inline-flex items-center gap-1 text-[12px] font-semibold text-body hover:text-brand">
              Full calendar <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <HoursCalendar days={days} today={today} />
        </ChartCard>

        <section className="card relative flex flex-col overflow-hidden bg-rail p-6 text-white">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand/30 blur-3xl" aria-hidden />
          <div className="relative flex items-center justify-between">
            <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/60">Next holiday</p>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10">
              <CalendarHeart className="h-[18px] w-[18px]" />
            </span>
          </div>
          {next ? (
            <div className="relative mt-auto pt-10">
              <p className="text-[44px] font-extrabold leading-none tracking-[-0.04em]">
                {nextIn === 0 ? "Today" : nextIn === 1 ? "Tomorrow" : `${nextIn} days`}
              </p>
              <p className="mt-3 text-lg font-bold">{next.label}</p>
              <p className="text-rail-text">
                {weekday(next.day, "long")}, {formatDate(next.day)}
              </p>
              <Link href="/app/holidays" className="mt-5 inline-flex items-center gap-1 text-[13px] font-semibold text-white/80 hover:text-white">
                Holiday list <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <p className="relative mt-auto pt-10 text-rail-text">No holidays in the next 12 months yet.</p>
          )}
        </section>
      </div>

    </>
  );
}

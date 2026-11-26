import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, FileSignature, ListChecks, CalendarCheck, CalendarHeart, Clock3, Hourglass, TimerReset, Wallet } from "lucide-react";
import { BarChart } from "@/components/charts/bar-chart";
import { ChartCard, Headline } from "@/components/charts/chart-card";
import { BLUE_RAMP } from "@/components/charts/chart-utils";
import { HoursCalendar } from "@/components/charts/hours-calendar";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatDate, todayIST } from "@/lib/format";
import { formatDuration, type DayKind, type DayRecord, type MyShift } from "@/lib/attendance";
import { daysBetween, monthName, weekday } from "@/lib/holidays";
import { balancesOn, formatDays, periodText, remaining, total, usable } from "@/lib/leave";
import { daysUntil } from "@/lib/letters";
import { ClockoutFix, type FixRequest } from "@/components/attendance/clockout-fix";
import { isSalaryWindow, monthTitle } from "@/lib/payroll";
import { shiftMonth } from "@/lib/overtime";
import { ClockCard } from "./clock-card";
import { AnniversaryCard } from "@/components/checklist/anniversary-card";
import { recentAnniversary } from "@/lib/checklists";

export const metadata: Metadata = { title: "Dashboard" };

type Recent = { day: string; kind: DayKind; label: string | null; status: string | null; is_late: boolean; open: boolean; minutes: number | null };
type Mine = { today: string; recent: Recent[]; next_holiday: { day: string; label: string } | null };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const PLACEHOLDER: Partial<Record<DayKind, string>> = { weekly_off: "Off", holiday: "Hol", leave: "Leave", untracked: "—" };
const PENDING_HATCH = "repeating-linear-gradient(45deg, #9ca3af 0 3px, #e5e7eb 3px 6px)";

export default async function EmployeeDashboard() {
  const { supabase, profile } = await requireRole("employee");
  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";

  const since = new Date(Date.parse(today + "T00:00:00Z") - 30 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: month }, { data: shiftData }, { data: mine }, balances, { data: types }, { data: missedRows }, { data: fixReqs }, { data: steps }, { data: me }, { data: milestones }, { data: company }, { data: contracts }] = await Promise.all([
    supabase.rpc("employee_month", { p_employee: profile.id, p_month: monthStart }),
    supabase.rpc("my_shift"),
    supabase.rpc("my_dashboard", { p_days: 14 }),
    balancesOn(supabase, today, profile.id),
    supabase.from("leave_types").select("id, name, tracks_balance, is_active, sort_order").eq("is_active", true).eq("tracks_balance", true).order("sort_order"),
    supabase
      .from("attendance")
      .select("id, work_date, clock_in, attendance_tasks(id, title, planned, done, sort_order)")
      .eq("employee_id", profile.id)
      .eq("status", "missed_clock_out")
      .is("clock_out", null)
      .gte("work_date", since)
      .order("work_date", { ascending: false }),
    supabase
      .from("clockout_fix_requests")
      .select("id, attendance_id, status, clock_out, review_note")
      .eq("employee_id", profile.id)
      .gte("work_date", since)
      .order("created_at", { ascending: false }),
    supabase.from("employee_tasks").select("owner, done_at").eq("employee_id", profile.id).eq("kind", "onboarding"),
    supabase.from("profiles").select("date_of_joining").eq("id", profile.id).single(),
    supabase.from("linkedin_milestones").select("years").eq("employee_id", profile.id),
    supabase.from("settings").select("company_name").single(),
    supabase.from("contracts").select("starts_on, ends_on").eq("employee_id", profile.id).order("starts_on"),
  ]);
  // Contract ending (or just ended) with no renewal yet.
  const myContracts = contracts ?? [];
  const nowContract = myContracts.find((c) => c.starts_on <= today && c.ends_on >= today);
  const lastEnded = [...myContracts].reverse().find((c) => c.ends_on < today);
  const renewed = (after: string) => myContracts.some((c) => c.starts_on > after);
  const contractNote =
    nowContract && daysUntil(today, nowContract.ends_on) <= 30 && !renewed(nowContract.ends_on)
      ? { ended: false, date: nowContract.ends_on, n: daysUntil(today, nowContract.ends_on) }
      : !nowContract && lastEnded && daysUntil(lastEnded.ends_on, today) <= 30 && !renewed(lastEnded.ends_on)
        ? { ended: true, date: lastEnded.ends_on, n: daysUntil(lastEnded.ends_on, today) }
        : null;
  const contractLeave = balances.filter((b) => b.state === "current" || b.state === "ended");
  const myLeft = (steps ?? []).filter((t) => t.owner === "employee" && !t.done_at).length;
  const myDone = (steps ?? []).filter((t) => t.done_at).length;
  const anniversary = recentAnniversary(me?.date_of_joining ?? null, today);
  const showAnniversary = anniversary && !(milestones ?? []).some((m) => m.years === anniversary.years);
  const missed = (missedRows ?? []).map((a) => ({
    attendance_id: a.id as string,
    day: a.work_date as string,
    clock_in: a.clock_in as string,
    tasks: [...((a.attendance_tasks ?? []) as { id: string; title: string; planned: boolean; done: boolean; sort_order: number }[])].sort((x, y) => x.sort_order - y.sort_order),
  }));
  const requests = (fixReqs ?? []) as FixRequest[];

  const days = (month ?? []) as (DayRecord & { day: string })[];
  const shift = shiftData as MyShift;
  // A night shift that started yesterday is still "today" until it ends.
  const workDay = shift?.day ?? today;
  let todayRec = days.find((d) => d.day === workDay);
  if (!todayRec && workDay < monthStart) {
    const { data: prev } = await supabase.rpc("employee_month", { p_employee: profile.id, p_month: workDay.slice(0, 8) + "01" });
    todayRec = ((prev ?? []) as (DayRecord & { day: string })[]).find((d) => d.day === workDay);
  }
  const past = days.filter((d) => d.day <= today);
  const workedDays = past.filter((d) => d.clock_in);
  const totalMins = workedDays.reduce((s, d) => s + (d.worked_minutes ?? 0), 0);
  const closedDays = workedDays.filter((d) => d.worked_minutes != null);
  const lateCount = workedDays.filter((d) => d.is_late).length;

  const m = mine as Mine | null;
  const recent = m?.recent ?? [];
  const recentWorked = recent.filter((r) => !r.open && r.minutes != null);
  const recentAvg = recentWorked.length ? recentWorked.reduce((s, r) => s + (r.minutes ?? 0), 0) / recentWorked.length : null;
  const targetMins = shift?.tracked && shift.minutes > 0 ? shift.minutes : 480;
  const metTarget = recentWorked.filter((r) => (r.minutes ?? 0) >= targetMins).length;
  const next = m?.next_holiday ?? null;
  const nextIn = next ? daysBetween(today, next.day) : null;

  const balanceRows = (types ?? [])
    .map((t) => {
      const b = balances.find((x) => x.leave_type_id === t.id && x.balance_id);
      return b ? { name: t.name, total: total(b), used: Number(b.used), pending: Number(b.pending), left: usable(b), period: periodText(b) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const tracked = shift?.tracked !== false;
  const nextHolidayCard = (
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
  );

  return (
    <>
      <PageHeader
        eyebrow="Employee portal"
        title={`${greeting()}, ${profile.full_name.split(" ")[0]}.`}
        description="Plan your day, clock in and keep track of your time."
      />

      {isSalaryWindow(today) && (
        <div role="status" className="animate-enter mt-6 flex items-start gap-3 rounded-2xl border border-line bg-white px-4 py-3.5 sm:items-center">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tint text-brand">
            <Wallet className="h-4 w-4" />
          </span>
          <p className="text-sm text-body">
            <b className="text-ink">Salaries for {monthTitle(shiftMonth(today.slice(0, 7), -1))} are being calculated.</b> Don&apos;t worry if you haven&apos;t
            received yours yet. Salaries are credited between the 1st and 10th of the month.
          </p>
        </div>
      )}

      {showAnniversary && <AnniversaryCard years={anniversary.years} daysSince={anniversary.daysSince} company={company?.company_name ?? "RohTre Media"} />}

      {contractNote && (
        <section aria-label="Your contract" className="animate-enter mt-6 flex items-start gap-4 rounded-[24px] border border-line bg-white p-5 sm:p-6">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-warning-tint text-warning">
            <FileSignature className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink">
              {contractNote.ended
                ? `Your contract ended on ${formatDate(contractNote.date)}`
                : `Your contract ends on ${formatDate(contractNote.date)} · ${contractNote.n === 0 ? "today" : `in ${contractNote.n} day${contractNote.n === 1 ? "" : "s"}`}`}
            </h2>
            <p className="mt-0.5 text-sm text-body">
              {contractLeave.length > 0 &&
                contractLeave.map((b, i) => {
                  const t = (types ?? []).find((x) => x.id === b.leave_type_id);
                  return (
                    <span key={b.leave_type_id}>
                      {i > 0 && ", "}
                      <b className="text-ink">{formatDays(remaining(b))}</b> of {t?.name ?? "leave"} unused
                    </span>
                  );
                })}
              {contractLeave.length > 0 && ". "}
              {contractNote.ended
                ? "You can take it again once HR renews your contract: unused days carry over."
                : "If the contract is renewed, unused days carry over. If it isn't, they lapse."}
            </p>
          </div>
        </section>
      )}

      {myLeft > 0 && (
        <Link
          href="/app/setup"
          className="animate-enter group mt-6 flex items-center gap-4 rounded-[24px] border border-line bg-white p-5 transition hover:border-body/30 sm:p-6"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tint text-brand">
            <ListChecks className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-ink">Finish getting set up</span>
            <span className="block text-sm text-body">
              {myLeft} step{myLeft === 1 ? "" : "s"} left for you · {myDone} of {(steps ?? []).length} done
            </span>
          </span>
          <ArrowUpRight className="h-5 w-5 shrink-0 text-body transition group-hover:text-ink" />
        </Link>
      )}

      {missed.length > 0 && (
        <section className="card mt-8 p-5 sm:p-6" aria-label="Missed clock-outs">
          <h2 className="text-base font-bold tracking-[-0.01em] text-ink">
            {missed.length === 1 ? "1 day without a clock-out" : `${missed.length} days without a clock-out`}
          </h2>
          <p className="mt-0.5 text-sm text-body">Those hours don&apos;t count until it&apos;s fixed. Send your leaving time to your admin.</p>
          <div className="mt-4 space-y-2.5">
            {missed.map((d) => (
              <ClockoutFix key={d.attendance_id} day={d} compact request={requests.find((r) => r.attendance_id === d.attendance_id)} workEnd={shift?.end} />
            ))}
          </div>
        </section>
      )}

      <div className={missed.length ? "mt-6" : "mt-8"}>
        {todayRec && shift && <ClockCard today={todayRec} shift={shift} isNightBefore={workDay < today} />}
      </div>

      {tracked && (
      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Days worked" value={workedDays.length} sub="This month" icon={<CalendarCheck />} tone="success" />
        <StatTile label="Hours this month" value={formatDuration(totalMins)} sub="Closed days only" icon={<Clock3 />} tone="dark" />
        <StatTile
          label="Average day"
          value={closedDays.length ? formatDuration(Math.round(totalMins / closedDays.length)) : "—"}
          sub={`Target ${formatDuration(targetMins)}`}
          icon={<Hourglass />}
          tone="info"
        />
        <StatTile label="Late arrivals" value={lateCount} sub="This month" icon={<TimerReset />} tone={lateCount ? "warning" : "brand"} />
      </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {tracked && (
        <ChartCard
          className="xl:col-span-2"
          title="Hours, last 14 days"
          description={`Time worked each day against your ${formatDuration(targetMins).replace(" 00m", "")} target`}
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
            target={{ value: targetMins / 60, label: `${formatDuration(targetMins).replace(" 00m", "")} target` }}
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
        )}

        <ChartCard
          className={tracked ? undefined : "xl:col-span-2"}
          title="Leave balance"
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
                    {b.period && <p className="text-[11.5px] text-body">{b.period}</p>}
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
            <p className="py-10 text-center text-sm text-body">No leave balances yet.</p>
          )}
        </ChartCard>
        {!tracked && nextHolidayCard}
      </div>

      {tracked && (
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

        {nextHolidayCard}
      </div>
      )}

    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, Clock3, Hourglass, TimerReset } from "lucide-react";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { formatDuration, type DayRecord } from "@/lib/attendance";
import { ClockCard } from "./clock-card";

export const metadata: Metadata = { title: "Dashboard" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function EmployeeDashboard() {
  const { supabase, profile } = await requireRole("employee");
  const today = todayIST();
  const monthStart = today.slice(0, 8) + "01";

  const [{ data: month }, { data: settings }] = await Promise.all([
    supabase.rpc("employee_month", { p_employee: profile.id, p_month: monthStart }),
    supabase.from("settings").select("work_start, work_end").single(),
  ]);

  const days = (month ?? []) as (DayRecord & { day: string })[];
  const todayRec = days.find((d) => d.day === today);
  const past = days.filter((d) => d.day <= today);
  const workedDays = past.filter((d) => d.clock_in);
  const totalMins = workedDays.reduce((s, d) => s + (d.worked_minutes ?? 0), 0);
  const closedDays = workedDays.filter((d) => d.worked_minutes != null);
  const lateCount = workedDays.filter((d) => d.is_late).length;
  const hhmm = (t?: string) => (t ?? "").slice(0, 5);

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

      <p className="mt-6 text-sm text-body">
        See every day of the month on your{" "}
        <Link href="/app/attendance" className="font-semibold text-ink underline-offset-4 hover:text-brand hover:underline">
          attendance calendar
        </Link>
        .
      </p>
    </>
  );
}

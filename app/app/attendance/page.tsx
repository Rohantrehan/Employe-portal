import type { Metadata } from "next";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { formatDuration } from "@/lib/attendance";
import { AttendanceMonth } from "./attendance-month";
import type { MonthDay } from "@/components/attendance/month-view";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase, profile } = await requireRole("employee");
  const today = todayIST();
  const { month: m } = await searchParams;
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= today.slice(0, 7) ? m : today.slice(0, 7);

  const { data } = await supabase.rpc("employee_month", { p_employee: profile.id, p_month: `${month}-01` });
  const days = (data ?? []) as MonthDay[];
  const past = days.filter((d) => d.day <= today);
  const worked = past.filter((d) => d.clock_in);
  const totalMins = worked.reduce((s, d) => s + (d.worked_minutes ?? 0), 0);
  const workingDays = past.filter((d) => d.day_kind === "working" || d.day_kind === "half_leave").length;
  const absent = past.filter((d) => d.day < today && (d.day_kind === "working" || d.day_kind === "half_leave") && !d.clock_in).length;

  return (
    <>
      <PageHeader eyebrow="My time" title="Attendance" description="Every day of the month with your clock-in times and tasks." />
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Present" value={`${worked.length} / ${workingDays}`} sub="Working days so far" tone="success" />
        <StatTile label="Hours" value={formatDuration(totalMins)} sub="Total this month" tone="dark" />
        <StatTile label="Late" value={worked.filter((d) => d.is_late).length} sub="Arrivals after grace time" tone="warning" />
        <StatTile label="Absent" value={absent} sub="Working days with no clock-in" tone="brand" />
      </div>
      <div className="mt-6">
        <AttendanceMonth days={days} month={month} today={today} />
      </div>
    </>
  );
}

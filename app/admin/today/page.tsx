import type { Metadata } from "next";
import { Briefcase, CheckCheck, Plane, TimerReset, UserX } from "lucide-react";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { formatDate, todayIST } from "@/lib/format";
import type { DayRecord } from "@/lib/attendance";
import { TodayBoard } from "./today-board";
import { DatePicker } from "./date-picker";

export const metadata: Metadata = { title: "Today" };

export type TeamRow = DayRecord & {
  employee_id: string;
  full_name: string;
  emp_code: string;
  designation: string | null;
  avatar_url: string | null;
  department: string | null;
};

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { supabase } = await requireRole("admin");
  const today = todayIST();
  const { date: d } = await searchParams;
  const date = d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today;

  await supabase.rpc("close_missed_clock_outs");
  const { data, error } = await supabase.rpc("team_day", { p_date: date });
  const rows = (data ?? []) as TeamRow[];

  const isToday = date === today;
  const working = rows.filter((r) => r.clock_in && !r.clock_out && r.status !== "missed_clock_out").length;
  const done = rows.filter((r) => r.clock_out).length;
  const onLeave = rows.filter((r) => !r.clock_in && (r.day_kind === "leave" || r.day_kind === "holiday")).length;
  const notIn = rows.filter((r) => !r.clock_in && (r.day_kind === "working" || r.day_kind === "half_leave")).length;
  const late = rows.filter((r) => r.is_late).length;
  const weeklyOff = rows.length > 0 && rows.every((r) => r.day_kind === "weekly_off" && !r.clock_in);

  return (
    <>
      <PageHeader
        eyebrow={isToday ? "Live" : "History"}
        title={isToday ? "Today" : formatDate(date)}
        description={isToday ? "Who is working, what they planned and what they finished." : "Attendance and tasks for this day."}
        actions={<DatePicker date={date} today={today} />}
      />

      {error && <p className="mt-6 rounded-2xl bg-tint-2 px-4 py-3 text-sm font-medium text-brand">Could not load the team board.</p>}

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatTile label={isToday ? "Working now" : "Still open"} value={working} icon={<Briefcase />} tone="success" />
        <StatTile label="Clocked out" value={done} icon={<CheckCheck />} tone="dark" />
        <StatTile label="On leave / holiday" value={onLeave} icon={<Plane />} tone="info" />
        <StatTile label={isToday ? "Not clocked in" : "Absent"} value={notIn} icon={<UserX />} tone="brand" />
        <StatTile label="Late" value={late} icon={<TimerReset />} tone="warning" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="mt-6">
        <TodayBoard rows={rows} date={date} isToday={isToday} weeklyOff={weeklyOff} />
      </div>
    </>
  );
}

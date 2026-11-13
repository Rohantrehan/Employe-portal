import type { Metadata } from "next";
import { CheckCircle2, Hourglass, Timer } from "lucide-react";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { extraFromMinutes, formatHours, type OvertimeStatus } from "@/lib/overtime";
import { EmployeeOvertime, type MyEntry, type Suggestion } from "./employee-overtime";

export const metadata: Metadata = { title: "Extra hours" };

function minusDays(d: string, n: number) {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() - n);
  return x.toISOString().slice(0, 10);
}

export default async function EmployeeOvertimePage() {
  const { supabase, profile } = await requireRole("employee");
  const today = todayIST();
  const month = today.slice(0, 7);
  const since = minusDays(today, 45);

  const [{ data: entries }, { data: long }] = await Promise.all([
    supabase
      .from("overtime_entries")
      .select("id, work_date, hours, description, status, review_note")
      .eq("employee_id", profile.id)
      .gte("work_date", `${Number(today.slice(0, 4)) - 1}-01-01`)
      .order("work_date", { ascending: false }),
    supabase
      .from("attendance")
      .select("work_date, worked_minutes")
      .eq("employee_id", profile.id)
      .gte("work_date", since)
      .gt("worked_minutes", 480 + 14)
      .order("work_date", { ascending: false }),
  ]);

  const mine: MyEntry[] = (entries ?? []).map((e) => ({
    id: e.id,
    date: e.work_date,
    hours: Number(e.hours),
    description: e.description,
    status: e.status as OvertimeStatus,
    reviewNote: e.review_note,
  }));
  const logged = new Set(mine.filter((e) => e.status === "pending" || e.status === "approved").map((e) => e.date));
  const suggestions: Suggestion[] = (long ?? [])
    .filter((a) => !logged.has(a.work_date))
    .map((a) => ({ date: a.work_date, workedMinutes: a.worked_minutes!, extra: extraFromMinutes(a.worked_minutes!) }))
    .filter((s) => s.extra > 0);

  const sum = (f: (e: MyEntry) => boolean) => mine.filter(f).reduce((s, e) => s + e.hours, 0);
  const approvedMonth = sum((e) => e.status === "approved" && e.date.startsWith(month));
  const pending = sum((e) => e.status === "pending");
  const approvedYear = sum((e) => e.status === "approved" && e.date.startsWith(today.slice(0, 4)));

  return (
    <EmployeeOvertime
      header={<PageHeader eyebrow="My time" title="Extra hours" description="Log time worked beyond your normal hours. Your admin reviews it for extra pay." />}
      stats={
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Approved this month" value={formatHours(approvedMonth)} icon={<CheckCircle2 />} tone="success" />
          <StatTile label="Waiting for approval" value={formatHours(pending)} icon={<Hourglass />} tone={pending ? "warning" : "dark"} />
          <StatTile label={`Approved in ${today.slice(0, 4)}`} value={formatHours(approvedYear)} icon={<Timer />} tone="dark" />
        </div>
      }
      entries={mine}
      suggestions={suggestions}
      today={today}
      minDate={since}
    />
  );
}

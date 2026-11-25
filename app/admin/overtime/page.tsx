import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Hourglass, Timer, Users } from "lucide-react";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { formatHours, monthEnd, monthLabel, shiftMonth, type OvertimeStatus } from "@/lib/overtime";
import { OvertimeBoard, type AdminEntry } from "./overtime-board";

export const metadata: Metadata = { title: "Extra hours" };

export default async function AdminOvertimePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { supabase } = await requireRole("admin");
  const today = todayIST();
  const current = today.slice(0, 7);
  const { month: m } = await searchParams;
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m <= current ? m : current;

  const { data } = await supabase
    .from("overtime_entries")
    .select("id, employee_id, work_date, hours, description, status, review_note, created_at, profiles!overtime_entries_employee_id_fkey(full_name, emp_code, avatar_url)")
    .or(`status.eq.pending,and(work_date.gte.${month}-01,work_date.lte.${monthEnd(month)})`)
    .order("work_date", { ascending: false })
    .limit(1000);

  // Worked time on those days, for context while reviewing
  const rows = data ?? [];
  const empIds = [...new Set(rows.map((r) => r.employee_id))];
  const dates = [...new Set(rows.map((r) => r.work_date))];
  const { data: att } = empIds.length
    ? await supabase.from("attendance").select("employee_id, work_date, worked_minutes").in("employee_id", empIds).in("work_date", dates)
    : { data: [] as { employee_id: string; work_date: string; worked_minutes: number | null }[] };
  const workedOn = new Map((att ?? []).map((a) => [`${a.employee_id}:${a.work_date}`, a.worked_minutes]));

  const entries: AdminEntry[] = rows.map((r) => {
    const p = r.profiles as unknown as { full_name: string; emp_code: string; avatar_url: string | null } | null;
    return {
      id: r.id,
      employeeId: r.employee_id,
      employee: p?.full_name ?? "Former employee",
      empCode: p?.emp_code ?? "",
      avatar: p?.avatar_url ?? null,
      date: r.work_date,
      hours: Number(r.hours),
      description: r.description,
      status: r.status as OvertimeStatus,
      reviewNote: r.review_note,
      workedMinutes: workedOn.get(`${r.employee_id}:${r.work_date}`) ?? null,
    };
  });

  const inMonth = entries.filter((e) => e.date.startsWith(month));
  const pendingAll = entries.filter((e) => e.status === "pending");
  const approved = inMonth.filter((e) => e.status === "approved");
  const approvedHours = approved.reduce((s, e) => s + e.hours, 0);
  const people = new Set(approved.map((e) => e.employeeId)).size;

  const navBtn = "grid h-10 w-10 place-items-center rounded-full border border-line bg-white text-ink transition-colors hover:bg-app";
  const href = (mm: string) => (mm === current ? "/admin/overtime" : `/admin/overtime?month=${mm}`);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Extra hours"
        description="Approve extra hours. Approved hours appear on payroll for reference when you set night shift pay or the rating."
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

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Waiting for you" value={pendingAll.length} sub={pendingAll.length ? "Entries, any month" : "All caught up"} icon={<Hourglass />} tone={pendingAll.length ? "warning" : "success"} />
        <StatTile label={`Approved · ${monthLabel(month).split(" ")[0]}`} value={formatHours(approvedHours)} icon={<Timer />} tone="dark" />
        <StatTile label="People with extra hours" value={people} sub="Approved this month" icon={<Users />} tone="info" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="mt-6">
        <OvertimeBoard pending={pendingAll} monthEntries={inMonth} monthName={monthLabel(month)} />
      </div>
    </>
  );
}

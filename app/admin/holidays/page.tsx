import type { Metadata } from "next";
import { CalendarHeart, PartyPopper, Repeat, Sparkles } from "lucide-react";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { YearSwitch } from "@/components/holidays/bits";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import type { Holiday, SwapStatus } from "@/lib/holidays";
import { HolidayManager } from "./holiday-manager";
import { SwapQueue, type SwapRow } from "./swap-queue";

export const metadata: Metadata = { title: "Holidays" };

export default async function AdminHolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { supabase } = await requireRole("admin");
  const today = todayIST();
  const thisYear = Number(today.slice(0, 4));
  const { year: y } = await searchParams;
  const year = y && /^\d{4}$/.test(y) && Number(y) >= 2024 && Number(y) <= thisYear + 2 ? Number(y) : thisYear;

  const [{ data: hol }, { data: swaps }] = await Promise.all([
    supabase.from("holidays").select("id, date, name, type").eq("year", year).order("date"),
    supabase
      .from("floating_swaps")
      .select("id, new_date, reason, status, review_note, created_at, reviewed_at, holidays!inner(name, date, year), profiles!floating_swaps_employee_id_fkey(full_name, emp_code)")
      .eq("holidays.year", year)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const holidays = (hol ?? []) as Holiday[];
  const swapRows: SwapRow[] = (swaps ?? []).map((s) => {
    const h = s.holidays as unknown as { name: string; date: string };
    const p = s.profiles as unknown as { full_name: string; emp_code: string } | null;
    return {
      id: s.id,
      employee: p?.full_name ?? "Former employee",
      empCode: p?.emp_code ?? "",
      holidayName: h.name,
      holidayDate: h.date,
      newDate: s.new_date,
      reason: s.reason,
      status: s.status as SwapStatus,
      reviewNote: s.review_note,
      createdAt: s.created_at,
    };
  });

  const count = (t: Holiday["type"]) => holidays.filter((h) => h.type === t).length;
  const pending = swapRows.filter((s) => s.status === "pending").length;

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="Holidays"
        description="The company holiday calendar. Every Sunday is already a weekly off, so there's no need to add Sundays."
        actions={<YearSwitch year={year} max={thisYear + 2} hrefFor={(yr) => (yr === thisYear ? "/admin/holidays" : `/admin/holidays?year=${yr}`)} />}
      />

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label={`Holidays ${year}`} value={holidays.length} icon={<CalendarHeart />} tone="dark" />
        <StatTile label="Festival" value={count("festival")} icon={<PartyPopper />} tone="brand" />
        <StatTile label="Floating" value={count("floating")} sub="Employees can move these" icon={<Sparkles />} tone="info" />
        <StatTile label="Swap requests" value={pending} sub={pending ? "Waiting for you" : "Nothing pending"} icon={<Repeat />} tone={pending ? "warning" : "success"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <HolidayManager holidays={holidays} year={year} today={today} />
        <SwapQueue rows={swapRows} today={today} />
      </div>
    </>
  );
}

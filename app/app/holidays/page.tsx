import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { YearSwitch } from "@/components/holidays/bits";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import type { Holiday, SwapStatus } from "@/lib/holidays";
import { EmployeeHolidays, type MySwap } from "./employee-holidays";

export const metadata: Metadata = { title: "Holidays" };

export default async function EmployeeHolidaysPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { supabase, profile } = await requireRole("employee");
  const today = todayIST();
  const thisYear = Number(today.slice(0, 4));
  const { year: y } = await searchParams;
  const year = y && /^\d{4}$/.test(y) && Number(y) >= 2024 && Number(y) <= thisYear + 1 ? Number(y) : thisYear;

  const [{ data: hol }, { data: swaps }] = await Promise.all([
    supabase.from("holidays").select("id, date, name, type").eq("year", year).order("date"),
    supabase
      .from("floating_swaps")
      .select("id, holiday_id, new_date, reason, status, review_note, created_at, holidays!inner(name, date, year)")
      .eq("employee_id", profile.id)
      .eq("holidays.year", year)
      .order("created_at", { ascending: false }),
  ]);

  const mySwaps: MySwap[] = (swaps ?? []).map((s) => {
    const h = s.holidays as unknown as { name: string; date: string };
    return {
      id: s.id,
      holidayId: s.holiday_id,
      holidayName: h.name,
      holidayDate: h.date,
      newDate: s.new_date,
      reason: s.reason,
      status: s.status as SwapStatus,
      reviewNote: s.review_note,
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Time off"
        title="Holidays"
        description="Company holidays for the year. The office is also closed every Sunday."
        actions={<YearSwitch year={year} max={thisYear + 1} hrefFor={(yr) => (yr === thisYear ? "/app/holidays" : `/app/holidays?year=${yr}`)} />}
      />
      <div className="mt-8">
        <EmployeeHolidays holidays={(hol ?? []) as Holiday[]} swaps={mySwaps} today={today} year={year} />
      </div>
    </>
  );
}

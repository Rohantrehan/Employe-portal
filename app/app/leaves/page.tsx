import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { balancesOn, type DayPart, type LeaveStatus, type LeaveType } from "@/lib/leave";
import { EmployeeLeaves, type MyRequest } from "./employee-leaves";

export const metadata: Metadata = { title: "Leaves" };

export default async function EmployeeLeavesPage() {
  const { supabase, profile } = await requireRole("employee");
  const today = todayIST();
  const year = Number(today.slice(0, 4));

  const [{ data: types }, balances, { data: requests }] = await Promise.all([
    supabase.from("leave_types").select("*").eq("is_active", true).order("sort_order"),
    balancesOn(supabase, today, profile.id),
    supabase
      .from("leave_requests")
      .select("id, leave_type_id, start_date, end_date, day_part, days, reason, attachment_path, status, review_note, created_at")
      .eq("employee_id", profile.id)
      .order("start_date", { ascending: false })
      .limit(100),
  ]);

  const myRequests: MyRequest[] = (requests ?? []).map((r) => ({
    id: r.id,
    typeId: r.leave_type_id,
    start: r.start_date,
    end: r.end_date,
    part: r.day_part as DayPart,
    days: Number(r.days),
    reason: r.reason,
    attachment: r.attachment_path,
    status: r.status as LeaveStatus,
    reviewNote: r.review_note,
  }));

  return (
    <>
      <EmployeeLeaves
        header={<PageHeader eyebrow="Time off" title="Leaves" description="Your balances, and every request you've made." />}
        types={(types ?? []) as LeaveType[]}
        balances={balances}
        requests={myRequests}
        today={today}
        year={year}
        userId={profile.id}
      />
    </>
  );
}

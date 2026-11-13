import type { Metadata } from "next";
import { Inbox, Plane, CalendarRange } from "lucide-react";
import { PageHeader, StatTile } from "@/components/ui/misc";
import { YearSwitch } from "@/components/holidays/bits";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import type { DayPart, LeaveStatus, LeaveType } from "@/lib/leave";
import { LeaveTabs } from "./leave-tabs";
import { RequestsPanel, type AdminRequest } from "./requests-panel";
import { BalancesPanel, type BalanceRow } from "./balances-panel";
import { PoliciesPanel } from "./policies-panel";

export const metadata: Metadata = { title: "Leave" };

type Tab = "requests" | "balances" | "types";

export default async function AdminLeavesPage({ searchParams }: { searchParams: Promise<{ tab?: string; year?: string }> }) {
  const { supabase } = await requireRole("admin");
  const today = todayIST();
  const thisYear = Number(today.slice(0, 4));
  const sp = await searchParams;
  const tab: Tab = sp.tab === "balances" || sp.tab === "types" ? sp.tab : "requests";
  const year = sp.year && /^\d{4}$/.test(sp.year) && Number(sp.year) >= 2024 && Number(sp.year) <= thisYear + 1 ? Number(sp.year) : thisYear;

  // Make sure quotas + balances exist for the year being viewed (idempotent).
  await supabase.rpc("ensure_leave_year", { p_year: year });

  const [{ data: types }, { data: reqs }] = await Promise.all([
    supabase.from("leave_types").select("*").order("sort_order"),
    supabase
      .from("leave_requests")
      .select("id, leave_type_id, start_date, end_date, day_part, days, reason, attachment_path, status, review_note, created_at, profiles!leave_requests_employee_id_fkey(id, full_name, emp_code, avatar_url)")
      .or(`status.eq.pending,and(start_date.gte.${year}-01-01,start_date.lte.${year}-12-31)`)
      .order("start_date", { ascending: false })
      .limit(500),
  ]);

  const allTypes = (types ?? []) as LeaveType[];
  const requests: AdminRequest[] = (reqs ?? []).map((r) => {
    const p = r.profiles as unknown as { id: string; full_name: string; emp_code: string; avatar_url: string | null } | null;
    return {
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
      createdAt: r.created_at,
      employeeId: p?.id ?? "",
      employee: p?.full_name ?? "Former employee",
      empCode: p?.emp_code ?? "",
      avatar: p?.avatar_url ?? null,
    };
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const onLeaveToday = requests.filter((r) => r.status === "approved" && r.start <= today && r.end >= today).length;
  const approvedDays = requests.filter((r) => r.status === "approved" && r.start.startsWith(String(year))).reduce((s, r) => s + r.days, 0);

  let balances: BalanceRow[] = [];
  let policies: { leave_type_id: string; default_quota: number }[] = [];
  if (tab === "balances") {
    const [{ data: emps }, { data: bals }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, emp_code, avatar_url").eq("role", "employee").eq("is_active", true).order("full_name"),
      supabase.from("leave_balances").select("id, employee_id, leave_type_id, allotted, carried, used, pending").eq("year", year),
    ]);
    balances = (emps ?? []).map((e) => ({
      employeeId: e.id,
      name: e.full_name,
      empCode: e.emp_code,
      avatar: e.avatar_url,
      balances: (bals ?? []).filter((b) => b.employee_id === e.id).map((b) => ({ ...b, allotted: Number(b.allotted), carried: Number(b.carried), used: Number(b.used), pending: Number(b.pending) })),
    }));
  }
  if (tab === "types") {
    const { data } = await supabase.from("leave_policies").select("leave_type_id, default_quota").eq("year", year);
    policies = (data ?? []).map((p) => ({ leave_type_id: p.leave_type_id, default_quota: Number(p.default_quota) }));
  }

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Leave"
        description="Approve requests, adjust balances and set yearly quotas. Unused leave does not carry forward."
        actions={<YearSwitch year={year} max={thisYear + 1} hrefFor={(y) => `/admin/leaves?tab=${tab}${y === thisYear ? "" : `&year=${y}`}`} />}
      />

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="Waiting for you" value={pendingCount} sub={pendingCount ? "Pending requests" : "All caught up"} icon={<Inbox />} tone={pendingCount ? "warning" : "success"} />
        <StatTile label="On leave today" value={onLeaveToday} icon={<Plane />} tone="info" />
        <StatTile label={`Approved in ${year}`} value={approvedDays % 1 ? approvedDays.toFixed(1) : approvedDays} sub="Days, all types" icon={<CalendarRange />} tone="dark" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="mt-6">
        <LeaveTabs tab={tab} year={year} thisYear={thisYear} pending={pendingCount} />
      </div>

      <div className="mt-4">
        {tab === "requests" && <RequestsPanel requests={requests} types={allTypes} today={today} />}
        {tab === "balances" && <BalancesPanel rows={balances} types={allTypes.filter((t) => t.tracks_balance && t.is_active)} year={year} />}
        {tab === "types" && <PoliciesPanel types={allTypes} policies={policies} year={year} />}
      </div>
    </>
  );
}

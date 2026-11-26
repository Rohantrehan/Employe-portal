import { ClockOutReminder } from "@/components/attendance/clockout-reminder";
import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";
import type { MyShift } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";
import { unreadForEmployee } from "@/lib/requests";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { profile } = await requireRole("employee");
  // Always filter by this person: HR also has admin rights, so RLS alone would return everyone's rows.
  const [{ data: shiftData }, { data: steps }, { data: reqs }, { count: grants }] = await Promise.all([
    supabase.rpc("my_shift"),
    supabase.from("employee_tasks").select("owner, done_at").eq("employee_id", profile.id).eq("kind", "onboarding"),
    // Badge = HR replies they haven't opened.
    supabase.from("hr_requests").select("last_admin_at, employee_seen_at").eq("employee_id", profile.id).not("last_admin_at", "is", null),
    // "My access" shows only when they have a live grant.
    supabase.from("vault_grants").select("id", { count: "exact", head: true }).eq("employee_id", profile.id).is("revoked_at", null),
  ]);
  // "Getting started" shows once onboarding has begun; the badge counts the steps they still have to do.
  const badges: Record<string, number> = { "/app/requests": (reqs ?? []).filter(unreadForEmployee).length };
  if (grants) badges["/app/access"] = 0;
  if (steps?.length) badges["/app/setup"] = steps.filter((t) => t.owner === "employee" && !t.done_at).length;
  const shift = shiftData as MyShift | null;
  // A night shift keeps the date it started on.
  const { data: open } = shift?.tracked
    ? await supabase.from("attendance").select("clock_in").eq("employee_id", profile.id).eq("work_date", shift.day).is("clock_out", null).neq("status", "missed_clock_out").maybeSingle()
    : { data: null };

  return (
    <AppShell
      area="employee"
      badges={badges}
      user={{
        name: profile.full_name,
        email: profile.email,
        avatarUrl: profile.avatar_url,
        subtitle: profile.is_hr ? "HR" : (profile.designation ?? profile.emp_code),
      }}
      switchTo={profile.is_hr ? { href: "/admin", label: "Admin panel" } : undefined}
    >
      {open?.clock_in && shift && <ClockOutReminder date={shift.day} clockIn={open.clock_in} workEnd={shift.end} endsAt={shift.ends_at} />}
      {children}
    </AppShell>
  );
}

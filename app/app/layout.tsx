import { ClockOutReminder } from "@/components/attendance/clockout-reminder";
import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const today = todayIST();
  const supabase = await createClient();
  // RLS returns only this employee's rows, so this can run alongside the role check.
  const [{ profile }, { data: open }, { data: settings }] = await Promise.all([
    requireRole("employee"),
    supabase.from("attendance").select("clock_in").eq("work_date", today).is("clock_out", null).neq("status", "missed_clock_out").maybeSingle(),
    supabase.from("settings").select("work_end").single(),
  ]);

  return (
    <AppShell
      area="employee"
      user={{
        name: profile.full_name,
        email: profile.email,
        avatarUrl: profile.avatar_url,
        subtitle: profile.designation ?? profile.emp_code,
      }}
    >
      {open?.clock_in && <ClockOutReminder date={today} clockIn={open.clock_in} workEnd={String(settings?.work_end ?? "17:00").slice(0, 5)} />}
      {children}
    </AppShell>
  );
}

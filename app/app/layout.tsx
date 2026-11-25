import { ClockOutReminder } from "@/components/attendance/clockout-reminder";
import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";
import type { MyShift } from "@/lib/attendance";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [{ profile }, { data: shiftData }] = await Promise.all([requireRole("employee"), supabase.rpc("my_shift")]);
  const shift = shiftData as MyShift | null;
  // RLS returns only this employee's rows. A night shift keeps the date it started on.
  const { data: open } = shift?.tracked
    ? await supabase.from("attendance").select("clock_in").eq("work_date", shift.day).is("clock_out", null).neq("status", "missed_clock_out").maybeSingle()
    : { data: null };

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
      {open?.clock_in && shift && <ClockOutReminder date={shift.day} clockIn={open.clock_in} workEnd={shift.end} endsAt={shift.ends_at} />}
      {children}
    </AppShell>
  );
}

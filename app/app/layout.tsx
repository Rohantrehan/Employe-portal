import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("employee");
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
      {children}
    </AppShell>
  );
}

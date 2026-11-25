import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";
import { unreadForAdmin } from "@/lib/requests";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, supabase } = await requireRole("admin");
  // Requests with something new from the employee (a new request, a reply or a withdrawal).
  const { data: reqs } = await supabase.from("hr_requests").select("last_employee_at, admin_seen_at").order("updated_at", { ascending: false }).limit(1000);
  const unread = (reqs ?? []).filter(unreadForAdmin).length;
  return (
    <AppShell
      area="admin"
      badges={{ "/admin/requests": unread }}
      user={{ name: profile.full_name, email: profile.email, avatarUrl: profile.avatar_url, subtitle: "Administrator" }}
    >
      {children}
    </AppShell>
  );
}

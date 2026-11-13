import { AppShell } from "@/components/layout/app-shell";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireRole("admin");
  return (
    <AppShell
      area="admin"
      user={{ name: profile.full_name, email: profile.email, avatarUrl: profile.avatar_url, subtitle: "Administrator" }}
    >
      {children}
    </AppShell>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { requireFormer } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FormerLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireFormer();
  return (
    <AppShell area="former" user={{ name: profile.full_name, email: profile.email, avatarUrl: profile.avatar_url, subtitle: profile.emp_code }}>
      {children}
    </AppShell>
  );
}

import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const { profile } = await requireRole("admin");
  return (
    <>
      <PageHeader eyebrow="Admin panel" title={`Welcome, ${profile.full_name.split(" ")[0]}.`} description="Company-wide view of attendance, leave and payroll." />
      <Card className="mt-8">
        <EmptyState icon={<LayoutDashboard />} title="Dashboard coming soon" description="Charts and KPI tiles arrive in Phase 9. Start with Employees once Phase 3 is built." />
      </Card>
    </>
  );
}

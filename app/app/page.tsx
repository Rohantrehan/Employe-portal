import type { Metadata } from "next";
import { Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function EmployeeDashboard() {
  const { profile } = await requireRole("employee");
  return (
    <>
      <PageHeader eyebrow="Employee portal" title={`Good to see you, ${profile.full_name.split(" ")[0]}.`} description="Clock in, track your leave and download your payslips." />
      <Card className="mt-8">
        <EmptyState icon={<Clock3 />} title="Clock in arrives in Phase 4" description="Your clock-in card, tasks and charts will appear here." />
      </Card>
    </>
  );
}

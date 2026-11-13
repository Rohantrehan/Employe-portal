import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { NewEmployeeForm } from "./new-employee-form";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const { supabase } = await requireRole("admin");
  const { data: departments } = await supabase.from("departments").select("id, name").order("name");

  return (
    <>
      <Link href="/admin/employees" className="group inline-flex items-center gap-2 rounded-full px-3 py-2 -ml-3 text-sm font-semibold text-body transition hover:bg-white hover:text-ink">
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> Employees
      </Link>
      <PageHeader className="mt-2" eyebrow="People" title="Add employee" description="Create a login for a new team member." />
      <div className="mt-8">
        <NewEmployeeForm departments={departments ?? []} />
      </div>
    </>
  );
}

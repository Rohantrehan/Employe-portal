import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { requireRole } from "@/lib/auth";
import { EmployeesTable, type EmployeeRow } from "./employees-table";
import { DepartmentsButton } from "./departments-modal";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage() {
  const { supabase, profile: me } = await requireRole("admin");
  const [{ data: rows }, { data: departments }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, emp_code, full_name, email, designation, role, is_hr, is_active, left_on, date_of_joining, avatar_url, department_id, departments(name)")
      .order("is_active", { ascending: false })
      .order("full_name"),
    supabase.from("departments").select("id, name").order("name"),
  ]);

  const employees: EmployeeRow[] = (rows ?? []).map((r) => ({
    id: r.id,
    emp_code: r.emp_code,
    full_name: r.full_name,
    email: r.email,
    designation: r.designation,
    role: r.role,
    is_hr: r.is_hr,
    is_active: r.is_active,
    left_on: r.left_on,
    date_of_joining: r.date_of_joining,
    avatar_url: r.avatar_url,
    department_id: r.department_id,
    department: (r.departments as unknown as { name: string } | null)?.name ?? null,
    isMe: r.id === me.id,
  }));

  const counts = employees.reduce(
    (acc, e) => ({ ...acc, [e.department_id ?? ""]: (acc[e.department_id ?? ""] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Employees"
        description="Create logins, update details and control who can access the portal."
        actions={
          <>
            <DepartmentsButton departments={(departments ?? []).map((d) => ({ ...d, count: counts[d.id] ?? 0 }))} />
            <Link href="/admin/employees/new" className={buttonClass("primary")}>
              <UserPlus className="h-4 w-4" /> Add employee
            </Link>
          </>
        }
      />
      <div className="mt-8">
        <EmployeesTable employees={employees} departments={departments ?? []} />
      </div>
    </>
  );
}

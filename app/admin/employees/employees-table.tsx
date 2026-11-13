"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Search, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";
import type { Department } from "./employee-fields";

export type EmployeeRow = {
  id: string;
  emp_code: string;
  full_name: string;
  email: string;
  designation: string | null;
  role: "admin" | "employee";
  is_active: boolean;
  date_of_joining: string | null;
  avatar_url: string | null;
  department_id: string | null;
  department: string | null;
  isMe: boolean;
};

export function EmployeesTable({ employees, departments }: { employees: EmployeeRow[]; departments: Department[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [dept, setDept] = useState("");

  const counts = useMemo(
    () => ({
      active: employees.filter((e) => e.is_active).length,
      inactive: employees.filter((e) => !e.is_active).length,
      all: employees.length,
    }),
    [employees],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (status === "active" && !e.is_active) return false;
      if (status === "inactive" && e.is_active) return false;
      if (dept && (dept === "none" ? e.department_id : e.department_id !== dept)) return false;
      if (!needle) return true;
      return [e.full_name, e.email, e.emp_code, e.designation ?? "", e.department ?? ""].some((v) => v.toLowerCase().includes(needle));
    });
  }, [employees, q, status, dept]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <Tabs
          value={status}
          onChange={setStatus}
          items={[
            { value: "active", label: "Active", count: counts.active },
            { value: "inactive", label: "Deactivated", count: counts.inactive },
            { value: "all", label: "All", count: counts.all },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block">
            <span className="sr-only">Search employees</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-body" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, code"
              className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm outline-none transition focus:border-brand focus:ring-4 focus:ring-tint sm:w-64"
            />
          </label>
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            aria-label="Filter by department"
            className="h-10 cursor-pointer rounded-full border border-line bg-white px-4 text-sm font-semibold text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-tint"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="none">No department</option>
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={employees.length <= 1 ? "No employees yet" : "No one matches"}
          description={employees.length <= 1 ? "Add your first team member to create their login." : "Try a different search or filter."}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Employee</TH>
                  <TH>Code</TH>
                  <TH>Department</TH>
                  <TH>Joined</TH>
                  <TH>Status</TH>
                  <TH className="w-10" />
                </tr>
              </THead>
              <TBody>
                {shown.map((e) => (
                  <TR key={e.id} className="cursor-pointer" onClick={() => router.push(`/admin/employees/${e.id}`)}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={e.full_name} src={e.avatar_url} size={36} />
                        <div className="min-w-0">
                          <Link href={`/admin/employees/${e.id}`} className="font-semibold text-ink hover:text-brand" onClick={(ev) => ev.stopPropagation()}>
                            {e.full_name}
                          </Link>
                          {e.isMe && <span className="ml-2 text-xs font-semibold text-body">(you)</span>}
                          <p className="truncate text-[13px] text-body">{e.designation ?? e.email}</p>
                        </div>
                      </div>
                    </TD>
                    <TD className="font-mono text-[13px] text-body">{e.emp_code}</TD>
                    <TD className="text-body">{e.department ?? "—"}</TD>
                    <TD className="whitespace-nowrap text-body">{formatDate(e.date_of_joining)}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1.5">
                        {e.is_active ? <Badge tone="success" dot>Active</Badge> : <Badge tone="neutral">Deactivated</Badge>}
                        {e.role === "admin" && <Badge tone="dark">Admin</Badge>}
                      </div>
                    </TD>
                    <TD className="text-body">
                      <ChevronRight className="h-4 w-4" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          {/* Mobile list */}
          <ul className="divide-y divide-line md:hidden">
            {shown.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/employees/${e.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-soft">
                  <Avatar name={e.full_name} src={e.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">
                      {e.full_name} {e.isMe && <span className="text-xs font-semibold text-body">(you)</span>}
                    </p>
                    <p className="truncate text-[13px] text-body">
                      {e.emp_code} · {e.designation ?? e.department ?? e.email}
                    </p>
                  </div>
                  {e.is_active ? (e.role === "admin" ? <Badge tone="dark">Admin</Badge> : <Badge tone="success" dot>Active</Badge>) : <Badge>Off</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

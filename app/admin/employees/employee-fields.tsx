"use client";

import { Input, Select } from "@/components/ui/field";

export type Department = { id: string; name: string };
export type EmployeeDefaults = {
  full_name?: string;
  email?: string;
  emp_code?: string;
  phone?: string | null;
  designation?: string | null;
  department_id?: string | null;
  date_of_joining?: string | null;
  basic_salary?: number | null;
  role?: "employee" | "admin";
};

/** The shared set of inputs for creating and editing an employee. */
export function EmployeeFields({
  departments,
  defaults = {},
  errors = {},
  isEdit,
  lockRole,
}: {
  departments: Department[];
  defaults?: EmployeeDefaults;
  errors?: Record<string, string>;
  isEdit?: boolean;
  lockRole?: boolean;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Input label="Full name" name="full_name" defaultValue={defaults.full_name} required autoComplete="off" error={errors.full_name} />
      <Input
        label="Work email"
        name="email"
        type="email"
        defaultValue={defaults.email}
        required
        autoComplete="off"
        hint={isEdit ? "Changing it changes their login email." : "They log in with this email."}
        error={errors.email}
      />
      <Input
        label="Employee code"
        name="emp_code"
        defaultValue={defaults.emp_code}
        placeholder={isEdit ? undefined : "Auto, e.g. RT-002"}
        hint={isEdit ? undefined : "Leave empty to generate one."}
        error={errors.emp_code}
      />
      <Input label="Phone" name="phone" type="tel" defaultValue={defaults.phone ?? ""} placeholder="+91 98765 43210" error={errors.phone} />
      <Input label="Designation" name="designation" defaultValue={defaults.designation ?? ""} placeholder="e.g. Graphic Designer" error={errors.designation} />
      <Select label="Department" name="department_id" defaultValue={defaults.department_id ?? ""} error={errors.department_id}>
        <option value="">No department</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <Input label="Date of joining" name="date_of_joining" type="date" defaultValue={defaults.date_of_joining ?? ""} error={errors.date_of_joining} />
      <Input
        label="Basic salary (₹ / month)"
        name="basic_salary"
        type="number"
        inputMode="numeric"
        min={0}
        step="1"
        defaultValue={defaults.basic_salary ?? 0}
        hint="Pre-fills the monthly payslip."
        error={errors.basic_salary}
      />
      <Select
        label="Access"
        name="role"
        defaultValue={defaults.role ?? "employee"}
        disabled={lockRole}
        hint={lockRole ? "You can't change your own access." : "Admins can see and manage everyone."}
        error={errors.role}
      >
        <option value="employee">Employee</option>
        <option value="admin">Admin</option>
      </Select>
      {lockRole && <input type="hidden" name="role" value={defaults.role ?? "admin"} />}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Input, Select } from "@/components/ui/field";
import type { Schedule } from "@/lib/attendance";

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
  role?: "employee" | "hr" | "admin";
  schedule?: Schedule | null;
  shift_start?: string | null;
  shift_end?: string | null;
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
  const [schedule, setSchedule] = useState<Schedule>(defaults.schedule ?? "standard");
  const [start, setStart] = useState((defaults.shift_start ?? "").slice(0, 5));
  const [end, setEnd] = useState((defaults.shift_end ?? "").slice(0, 5));
  const overnight = schedule === "custom" && !!start && !!end && end < start;

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
        hint={lockRole ? "You can't change your own access." : "Admins and HR can see and manage everyone. HR also clocks in and takes leave like an employee."}
        error={errors.role}
      >
        <option value="employee">Employee</option>
        <option value="hr">HR (employee + admin)</option>
        <option value="admin">Admin</option>
      </Select>
      {lockRole && <input type="hidden" name="role" value={defaults.role ?? "admin"} />}

      <fieldset className="grid gap-5 border-t border-line pt-5 sm:col-span-2 sm:grid-cols-2">
        <legend className="sr-only">Working hours</legend>
        <Select
          label="Working hours"
          name="schedule"
          value={schedule}
          onChange={(e) => setSchedule(e.target.value as Schedule)}
          hint={
            schedule === "standard"
              ? "Uses the office hours from Settings."
              : schedule === "custom"
                ? "Late and early leave are checked against these hours."
                : "No clock-in. Never marked late or absent. Leave still works."
          }
          error={errors.schedule}
        >
          <option value="standard">Company hours</option>
          <option value="custom">Custom hours</option>
          <option value="none">Attendance not tracked</option>
        </Select>
        {schedule === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Starts" name="shift_start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required error={errors.shift_start} />
            <Input
              label="Ends"
              name="shift_end"
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
              hint={overnight ? "Night shift: ends the next morning. It counts for the day it starts." : undefined}
              error={errors.shift_end}
            />
          </div>
        ) : (
          <div aria-hidden className="hidden sm:block" />
        )}
      </fieldset>
    </div>
  );
}

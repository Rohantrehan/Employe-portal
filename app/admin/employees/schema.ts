import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const hhmm = z
  .string()
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d(:00)?$/, "Pick a time")
  .transform((v) => (v === "" ? null : v.slice(0, 5)))
  .nullable()
  .optional();

const baseSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  emp_code: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .regex(/^$|^[A-Z0-9-]+$/, "Use letters, numbers and dashes only")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  phone: z
    .string()
    .trim()
    .regex(/^$|^[+0-9 ()-]{7,20}$/, "Enter a valid phone number")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  designation: optionalText(80),
  department_id: z
    .string()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .refine((v) => v == null || /^[0-9a-f-]{36}$/i.test(v), "Pick a department"),
  date_of_joining: z
    .string()
    .regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Pick a date")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  basic_salary: z.coerce.number({ message: "Enter an amount" }).min(0, "Cannot be negative").max(100_000_000, "Too large"),
  role: z.enum(["employee", "admin"]).default("employee"),
  schedule: z.enum(["standard", "custom", "none"]).default("standard"),
  shift_start: hhmm,
  shift_end: hhmm,
});

export const employeeSchema = baseSchema
  .refine((v) => v.schedule !== "custom" || !!v.shift_start, { message: "Pick a start time", path: ["shift_start"] })
  .refine((v) => v.schedule !== "custom" || !!v.shift_end, { message: "Pick an end time", path: ["shift_end"] })
  .refine((v) => v.schedule !== "custom" || v.shift_start !== v.shift_end, { message: "Start and end can't be the same", path: ["shift_end"] });

export type EmployeeInput = z.infer<typeof employeeSchema>;

export function fieldErrorsOf(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

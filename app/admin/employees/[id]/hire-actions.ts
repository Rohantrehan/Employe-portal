"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const hireSchema = z
  .object({
    id: z.string().uuid().nullable(),
    employeeId: z.string().uuid(),
    kind: z.enum(["offer", "contract"]),
    designation: z.string().trim().min(1, "Enter the position").max(120),
    department: z.string().trim().max(120),
    from: date,
    to: date.or(z.literal("")),
    salary: z.coerce.number({ message: "Enter the monthly salary" }).positive("Enter the monthly salary").max(100_000_000, "That salary is too large"),
    pronoun: z.enum(["he", "she", "they"]),
    body: z.string().trim().min(20, "The letter text is too short").max(5000, "The letter text is too long"),
  })
  .refine((v) => v.kind === "offer" || v.to !== "", { message: "Pick the end date", path: ["to"] })
  .refine((v) => !v.to || v.to >= v.from, { message: "The end date must be on or after the start date", path: ["to"] });

/** Save an offer letter or contract as a draft (issuing, cancelling and deleting use the shared letter actions). */
export async function saveHireLetter(input: z.input<typeof hireSchema>): Promise<Result<{ id: string }>> {
  const { supabase } = await requireRole("admin");
  const parsed = hireSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { data, error } = await supabase.rpc("save_letter", {
    p_id: v.id,
    p_employee: v.employeeId,
    p_kind: v.kind,
    p_designation: v.designation,
    p_department: v.department,
    p_from: v.from,
    p_to: v.to || null,
    p_conduct: null,
    p_pronoun: v.pronoun,
    p_body: v.body,
    p_salary: v.salary,
  });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not save the letter." };
  revalidatePath(`/admin/employees/${v.employeeId}`);
  revalidatePath("/admin");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const days = z.number({ error: "Enter a number" }).min(0, "Can't be negative").max(365, "Too many days").multipleOf(0.5, "Use whole or half days");
const dbError = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);

function refresh(employeeId: string) {
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin");
  revalidatePath("/admin/leaves");
  revalidatePath("/app");
  revalidatePath("/app/leaves");
}

const recordSchema = z.object({
  id: uuid.nullable(),
  employeeId: uuid,
  from: date,
  to: date,
  note: z.string().trim().max(300, "Keep the note under 300 characters"),
  left: z.record(uuid, days).optional(),
});

/** Record a contract signed on paper (people who already work here), or change one. */
export async function recordContract(input: z.input<typeof recordSchema>): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (v.to < v.from) return { ok: false, error: "The end date is before the start date." };
  const { error } = await supabase.rpc("record_contract", {
    p_id: v.id,
    p_employee: v.employeeId,
    p_from: v.from,
    p_to: v.to,
    p_note: v.note,
    p_left: v.left ?? null,
  });
  if (error) return { ok: false, error: dbError(error, "Could not save the contract.") };
  refresh(v.employeeId);
  return { ok: true };
}

export async function removeContract(id: string, employeeId: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(id).success || !uuid.safeParse(employeeId).success) return { ok: false, error: "Contract not found." };
  const { error } = await supabase.rpc("remove_contract", { p_id: id });
  if (error) return { ok: false, error: dbError(error, "Could not remove the contract.") };
  refresh(employeeId);
  return { ok: true };
}

/** Set how many days are left on one contract; null = back to automatic carry-over. */
export async function setLeaveLeft(balanceId: string, employeeId: string, left: number | null): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(balanceId).success || !uuid.safeParse(employeeId).success) return { ok: false, error: "Balance not found." };
  if (left !== null) {
    const p = days.safeParse(left);
    if (!p.success) return { ok: false, error: p.error.issues[0].message };
  }
  const { error } = await supabase.rpc("set_leave_left", { p_balance: balanceId, p_left: left });
  if (error) return { ok: false, error: dbError(error, "Could not save.") };
  refresh(employeeId);
  return { ok: true };
}

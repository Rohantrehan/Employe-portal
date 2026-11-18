"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { todayIST } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const BAN_FOREVER = "876000h";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const uuid = z.string().uuid();

const dbError = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);

function refresh(employeeId: string) {
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin/employees");
  revalidatePath("/admin/payroll");
}

/** Login is blocked only for people who have already left and whose documents access is off. */
async function syncBan(employeeId: string, lastDay: string | null, access: boolean) {
  const ban = !!lastDay && lastDay < todayIST() && !access;
  const { error } = await createAdminClient().auth.admin.updateUserById(employeeId, { ban_duration: ban ? BAN_FOREVER : "none" });
  return !error;
}

// ---------------------------------------------------------------------
// Exit
// ---------------------------------------------------------------------
const exitSchema = z.object({
  employeeId: uuid,
  lastDay: date,
  reason: z.enum(["resigned", "contract_ended", "terminated", "other"]),
  conduct: z.enum(["excellent", "good", "satisfactory"]),
  letters: z.boolean(),
  access: z.boolean(),
  note: z.string().trim().max(1000, "Keep the note under 1000 characters"),
});

export async function recordExit(input: z.input<typeof exitSchema>): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const parsed = exitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.rpc("record_exit", {
    p_employee: v.employeeId,
    p_last_day: v.lastDay,
    p_reason: v.reason,
    p_conduct: v.conduct,
    p_letters: v.letters,
    p_access: v.access,
    p_note: v.note,
  });
  if (error) return { ok: false, error: dbError(error, "Could not save the exit. Please try again.") };
  if (!(await syncBan(v.employeeId, v.lastDay, v.access))) return { ok: false, error: "Saved, but the login could not be updated. Try again." };
  refresh(v.employeeId);
  return { ok: true };
}

export async function undoExit(employeeId: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(employeeId).success) return { ok: false, error: "Employee not found." };
  const { error } = await supabase.rpc("undo_exit", { p_employee: employeeId });
  if (error) return { ok: false, error: dbError(error, "Could not undo the exit.") };
  await syncBan(employeeId, null, true);
  refresh(employeeId);
  return { ok: true };
}

export async function setFormerAccess(employeeId: string, on: boolean): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(employeeId).success) return { ok: false, error: "Employee not found." };
  const { error } = await supabase.rpc("set_former_access", { p_employee: employeeId, p_on: on });
  if (error) return { ok: false, error: dbError(error, "Could not change access.") };
  const { data: p } = await supabase.from("profiles").select("left_on").eq("id", employeeId).single();
  if (!(await syncBan(employeeId, p?.left_on ?? null, on))) return { ok: false, error: "Could not update the login. Try again." };
  refresh(employeeId);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Letters
// ---------------------------------------------------------------------
const letterSchema = z
  .object({
    id: uuid.nullable(),
    employeeId: uuid,
    kind: z.enum(["experience", "relieving"]),
    designation: z.string().trim().min(1, "Enter the designation").max(120),
    department: z.string().trim().max(120),
    from: date,
    to: date,
    conduct: z.enum(["excellent", "good", "satisfactory"]).nullable(),
    pronoun: z.enum(["he", "she", "they"]),
    body: z.string().trim().min(20, "The letter text is too short").max(5000, "The letter text is too long"),
  })
  .refine((v) => v.to >= v.from, { message: 'The "to" date must be on or after the "from" date' });

export async function saveLetter(input: z.input<typeof letterSchema>): Promise<Result<{ id: string }>> {
  const { supabase } = await requireRole("admin");
  const parsed = letterSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { data, error } = await supabase.rpc("save_letter", {
    p_id: v.id,
    p_employee: v.employeeId,
    p_kind: v.kind,
    p_designation: v.designation,
    p_department: v.department,
    p_from: v.from,
    p_to: v.to,
    p_conduct: v.conduct,
    p_pronoun: v.pronoun,
    p_body: v.body,
  });
  if (error) return { ok: false, error: dbError(error, "Could not save the letter.") };
  refresh(v.employeeId);
  return { ok: true, data: { id: (data as { id: string }).id } };
}

async function letterRpc(fn: "issue_letter" | "delete_letter", id: string, employeeId: string, fallback: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Letter not found." };
  const { error } = await supabase.rpc(fn, { p_id: id });
  if (error) return { ok: false, error: dbError(error, fallback) };
  refresh(employeeId);
  return { ok: true };
}

export async function issueLetter(id: string, employeeId: string) {
  return letterRpc("issue_letter", id, employeeId, "Could not issue the letter.");
}

export async function deleteLetter(id: string, employeeId: string) {
  return letterRpc("delete_letter", id, employeeId, "Could not delete the draft.");
}

export async function cancelLetter(id: string, employeeId: string, reason: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Letter not found." };
  const { error } = await supabase.rpc("cancel_letter", { p_id: id, p_reason: reason });
  if (error) return { ok: false, error: dbError(error, "Could not cancel the letter.") };
  refresh(employeeId);
  return { ok: true };
}

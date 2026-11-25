"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

const uuid = z.string().uuid();
const dbError = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);

function refresh(employeeId: string) {
  revalidatePath(`/admin/employees/${employeeId}`);
  revalidatePath("/admin");
}

const addSchema = z.object({
  employeeId: uuid,
  kind: z.enum(["onboarding", "offboarding"]),
  items: z.array(uuid).max(100),
  custom: z.string().trim().max(120, "Keep the step name under 120 characters"),
});

/** Start someone's list, or add more steps to it. */
export async function addTasks(input: z.input<typeof addSchema>): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.rpc("add_employee_tasks", { p_employee: v.employeeId, p_kind: v.kind, p_items: v.items, p_custom: v.custom });
  if (error) return { ok: false, error: dbError(error, "Could not add the steps.") };
  refresh(v.employeeId);
  return { ok: true };
}

export async function removeTask(employeeId: string, id: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(id).success || !uuid.safeParse(employeeId).success) return { ok: false, error: "Step not found." };
  const { error } = await supabase.rpc("remove_employee_task", { p_id: id });
  if (error) return { ok: false, error: dbError(error, "Could not remove the step.") };
  refresh(employeeId);
  return { ok: true };
}

const doneSchema = z.object({ employeeId: uuid, id: uuid, done: z.boolean(), answer: z.string().trim().max(500, "That link is too long") });

/** Admins can tick any step, including the employee's own ones. */
export async function setTaskDoneAdmin(input: z.input<typeof doneSchema>): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const parsed = doneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.rpc("set_task_done", { p_id: v.id, p_done: v.done, p_answer: v.answer });
  if (error) return { ok: false, error: dbError(error, "Could not update the step.") };
  refresh(v.employeeId);
  return { ok: true };
}

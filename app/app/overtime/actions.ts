"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date you worked extra"),
  hours: z.coerce.number({ message: "Enter the hours" }).positive("Enter the hours").max(16, "At most 16 hours"),
  description: z.string().trim().min(3, "Describe what you worked on").max(1000),
});

const msg = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);

export async function logOvertime(v: z.input<typeof schema>): Promise<Result> {
  const { supabase } = await requireRole("employee");
  const p = schema.safeParse(v);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { error } = await supabase.rpc("log_overtime", { p_date: p.data.date, p_hours: p.data.hours, p_description: p.data.description });
  if (error) return { ok: false, error: msg(error, "Could not save. Please try again.") };
  revalidatePath("/app/overtime");
  revalidatePath("/admin/overtime");
  return { ok: true };
}

export async function cancelOvertime(id: string): Promise<Result> {
  const { supabase } = await requireRole("employee");
  const { error } = await supabase.rpc("cancel_overtime", { p_id: id });
  if (error) return { ok: false, error: msg(error, "Could not cancel. Please try again.") };
  revalidatePath("/app/overtime");
  revalidatePath("/admin/overtime");
  return { ok: true };
}

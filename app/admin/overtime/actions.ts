"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

export async function reviewOvertime(id: string, approve: boolean, note: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.rpc("review_overtime", { p_id: id, p_approve: approve, p_note: note });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not update the entry." };
  revalidatePath("/admin/overtime");
  revalidatePath("/app/overtime");
  return { ok: true };
}

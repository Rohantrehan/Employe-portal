"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

export async function requestSwap(holidayId: string, newDate: string, reason: string): Promise<Result> {
  const { supabase } = await requireRole("employee");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return { ok: false, error: "Pick the day you want off instead." };
  const { error } = await supabase.rpc("request_floating_swap", { p_holiday: holidayId, p_new_date: newDate, p_reason: reason });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not send the request. Please try again." };
  revalidatePath("/app/holidays");
  revalidatePath("/admin/holidays");
  return { ok: true };
}

export async function cancelSwap(id: string): Promise<Result> {
  const { supabase } = await requireRole("employee");
  const { error } = await supabase.rpc("cancel_floating_swap", { p_id: id });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not cancel the request." };
  revalidatePath("/app/holidays");
  revalidatePath("/admin/holidays");
  return { ok: true };
}

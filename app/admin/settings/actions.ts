"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

export type SettingsState = { ok?: boolean; error?: string } | undefined;

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { supabase } = await requireRole("admin");
  const num = (k: string) => Number(String(formData.get(k) ?? "").trim());
  const { error } = await supabase.rpc("save_settings", {
    p_company_name: String(formData.get("company_name") ?? ""),
    p_work_start: String(formData.get("work_start") ?? ""),
    p_work_end: String(formData.get("work_end") ?? ""),
    p_grace: Math.round(num("grace_minutes")),
    p_half_day: num("half_day_min_hours"),
  });
  if (error) return { error: error.code === "P0001" ? error.message : "Could not save settings. Check the values and try again." };
  revalidatePath("/", "layout");
  return { ok: true };
}

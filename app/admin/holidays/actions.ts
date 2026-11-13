"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string; field?: string };

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  name: z.string().trim().min(2, "Enter a name").max(120, "Use at most 120 characters"),
  type: z.enum(["company", "festival", "floating"]),
});

function revalidate() {
  revalidatePath("/admin/holidays");
  revalidatePath("/app/holidays");
  revalidatePath("/admin/today");
}

export async function saveHoliday(id: string | null, input: z.input<typeof holidaySchema>): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const parsed = holidaySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0]) };
  }

  const { error } = id
    ? await supabase.from("holidays").update(parsed.data).eq("id", id)
    : await supabase.from("holidays").insert(parsed.data);

  if (error) {
    if (error.code === "23505") return { ok: false, error: "There's already a holiday on this date.", field: "date" };
    if (error.code === "P0001") return { ok: false, error: error.message };
    return { ok: false, error: "Could not save the holiday. Please try again." };
  }
  await supabase.rpc("log_action", {
    p_action: id ? "holiday.update" : "holiday.create",
    p_entity: "holiday",
    p_entity_id: id ?? parsed.data.date,
    p_payload: parsed.data,
  });
  revalidate();
  return { ok: true };
}

export async function deleteHoliday(id: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const { data: hol } = await supabase.from("holidays").select("date, name").eq("id", id).single();
  // Swaps for this holiday are removed with it (FK cascade): the original day becomes a normal working day.
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete the holiday." };
  await supabase.rpc("log_action", { p_action: "holiday.delete", p_entity: "holiday", p_entity_id: id, p_payload: hol ?? null });
  revalidate();
  return { ok: true };
}

export async function reviewSwap(id: string, approve: boolean, note: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.rpc("review_floating_swap", { p_id: id, p_approve: approve, p_note: note });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not update the request." };
  revalidate();
  return { ok: true };
}

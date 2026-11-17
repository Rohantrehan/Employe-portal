"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type FixActionResult = { ok: true } | { ok: false; error: string };

const schema = z.object({
  attendanceId: z.string().uuid(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter the time you left"),
  done: z.array(z.string().uuid()).max(50),
  summary: z.string().trim().min(3, "Write a short summary of what you did").max(2000),
  reason: z.string().trim().min(3, "Say briefly why you missed the clock-out").max(500),
});

/** Employee asks the admin to add a missing clock-out. */
export async function requestClockoutFix(input: z.input<typeof schema>): Promise<FixActionResult> {
  const { supabase } = await requireRole("employee");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.rpc("request_clockout_fix", {
    p_attendance: v.attendanceId,
    p_time: v.time,
    p_done: v.done,
    p_summary: v.summary,
    p_reason: v.reason,
  });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not send the request. Please try again." };
  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function cancelClockoutFix(id: string): Promise<FixActionResult> {
  const { supabase } = await requireRole("employee");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid request" };
  const { error } = await supabase.rpc("cancel_clockout_fix", { p_id: id });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Could not cancel. Please try again." };
  revalidatePath("/app", "layout");
  revalidatePath("/admin", "layout");
  return { ok: true };
}

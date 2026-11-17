"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";

export type SimpleResult = { ok: true } | { ok: false; error: string };

function dbMessage(error: { message: string; code?: string }) {
  // Business-rule errors raised in clock_in/clock_out are already written for people.
  if (error.code === "P0001") return error.message;
  if (error.code === "23505") return "You have already clocked in today.";
  return "Something went wrong. Please try again.";
}

export async function clockInAction(tasks: string[]): Promise<SimpleResult> {
  const { supabase } = await requireRole("employee");
  const clean = tasks.map((t) => t.trim()).filter(Boolean).slice(0, 20);
  if (!clean.length) return { ok: false, error: "Write at least one task you plan to do today." };
  const { error } = await supabase.rpc("clock_in", { p_tasks: clean });
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath("/app", "layout");
  revalidatePath("/app/attendance");
  return { ok: true };
}

export async function clockOutAction(input: { done: string[]; extra: string[]; summary: string }): Promise<SimpleResult> {
  const { supabase } = await requireRole("employee");
  const summary = input.summary.trim();
  if (summary.length < 3) return { ok: false, error: "Write a short summary of what you did today." };
  const { error } = await supabase.rpc("clock_out", {
    p_done: input.done,
    p_extra: input.extra.map((t) => t.trim()).filter(Boolean).slice(0, 20),
    p_summary: summary,
  });
  if (error) return { ok: false, error: dbMessage(error) };
  revalidatePath("/app", "layout");
  revalidatePath("/app/attendance");
  return { ok: true };
}

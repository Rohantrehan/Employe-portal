"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

const dbError = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);

const doneSchema = z.object({ id: z.string().uuid(), done: z.boolean(), answer: z.string().trim().max(500, "That link is too long") });

/** Tick (or un-tick) one of my own onboarding steps. */
export async function setMyTaskDone(input: z.input<typeof doneSchema>): Promise<Result> {
  const { supabase } = await requireRole("employee");
  const parsed = doneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.rpc("set_task_done", { p_id: v.id, p_done: v.done, p_answer: v.answer });
  if (error) return { ok: false, error: dbError(error, "Could not update the step.") };
  revalidatePath("/app", "layout");
  return { ok: true };
}

const milestoneSchema = z.object({
  years: z.number().int().min(1).max(60),
  posted: z.boolean(),
  url: z.string().trim().max(500, "That link is too long"),
});

/** "Have you posted about your work anniversary?" (the link is optional and never checked). */
export async function answerMilestone(input: z.input<typeof milestoneSchema>): Promise<Result> {
  const { supabase } = await requireRole("employee");
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.rpc("answer_linkedin_milestone", { p_years: v.years, p_posted: v.posted, p_url: v.url });
  if (error) return { ok: false, error: dbError(error, "Could not save your answer.") };
  revalidatePath("/app");
  return { ok: true };
}

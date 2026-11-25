"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

const dbError = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);

const itemSchema = z.object({
  id: z.string().uuid().nullable(),
  kind: z.enum(["onboarding", "offboarding"]),
  title: z.string().trim().min(2, "Enter a step name").max(120, "Keep the step name under 120 characters"),
  details: z.string().trim().max(600, "Keep the details under 600 characters"),
  link_url: z.string().trim().max(500, "That link is too long").refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), "The link must start with https://"),
  link_label: z.string().trim().max(40, "Keep the button text under 40 characters"),
  owner: z.enum(["employee", "admin"]),
  ask_link: z.string().trim().max(80, "Keep the question under 80 characters"),
  applies: z.enum(["all", "short", "long", "pick"]),
});

export async function saveChecklistItem(input: z.input<typeof itemSchema>): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { error } = await supabase.rpc("save_checklist_item", {
    p_id: v.id,
    p_kind: v.kind,
    p_title: v.title,
    p_details: v.details,
    p_link_url: v.link_url,
    p_link_label: v.link_label,
    p_owner: v.owner,
    p_ask_link: v.ask_link,
    p_applies: v.applies,
  });
  if (error) return { ok: false, error: dbError(error, "Could not save the step.") };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function deleteChecklistItem(id: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Step not found." };
  const { error } = await supabase.rpc("delete_checklist_item", { p_id: id });
  if (error) return { ok: false, error: dbError(error, "Could not remove the step.") };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function moveChecklistItem(id: string, dir: -1 | 1): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Step not found." };
  const { error } = await supabase.rpc("move_checklist_item", { p_id: id, p_dir: dir });
  if (error) return { ok: false, error: dbError(error, "Could not move the step.") };
  revalidatePath("/admin/settings");
  return { ok: true };
}

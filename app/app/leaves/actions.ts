"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Preview = {
  days: number;
  tracks_balance: boolean;
  available: number | null;
  excluded: { date: string; label: string }[];
  error: string | null;
};

const input = z.object({
  typeId: z.string().uuid("Pick a leave type"),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the dates"),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the dates"),
  part: z.enum(["full", "first_half", "second_half"]),
});

const msg = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);

export async function previewLeave(v: z.input<typeof input>): Promise<Preview | { error: string }> {
  const { supabase } = await requireRole("employee");
  const p = input.safeParse(v);
  if (!p.success) return { error: p.error.issues[0].message };
  const { data, error } = await supabase.rpc("leave_preview", {
    p_type: p.data.typeId,
    p_start: p.data.start,
    p_end: p.data.end,
    p_part: p.data.part,
  });
  if (error) return { error: msg(error, "Could not check these dates.") };
  return data as Preview;
}

export async function applyLeave(v: z.input<typeof input> & { reason: string; attachmentPath: string | null }) {
  const { supabase } = await requireRole("employee");
  const p = input.safeParse(v);
  if (!p.success) return { ok: false as const, error: p.error.issues[0].message };
  const { error } = await supabase.rpc("apply_leave", {
    p_type: p.data.typeId,
    p_start: p.data.start,
    p_end: p.data.end,
    p_part: p.data.part,
    p_reason: v.reason,
    p_attachment: v.attachmentPath,
  });
  if (error) return { ok: false as const, error: msg(error, "Could not send the request. Please try again.") };
  revalidatePath("/app/leaves");
  revalidatePath("/admin/leaves");
  return { ok: true as const };
}

export async function cancelLeave(id: string) {
  const { supabase } = await requireRole("employee");
  const { error } = await supabase.rpc("cancel_leave", { p_id: id });
  if (error) return { ok: false as const, error: msg(error, "Could not cancel. Please try again.") };
  revalidatePath("/app/leaves");
  revalidatePath("/admin/leaves");
  return { ok: true as const };
}

/** Short-lived link to one of my own attachments. */
export async function myAttachmentUrl(path: string) {
  const { supabase, profile } = await requireRole("employee");
  if (!path.startsWith(profile.id + "/")) return { ok: false as const, error: "Not allowed" };
  const { data, error } = await supabase.storage.from("leave-attachments").createSignedUrl(path, 60);
  if (error || !data) return { ok: false as const, error: "Could not open the file." };
  return { ok: true as const, url: data.signedUrl };
}

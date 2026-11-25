"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const dbError = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);
const uuid = z.string().uuid();

const newSchema = z.object({
  category: z.enum(["documents", "salary", "leave_attendance", "access", "concern", "other"], { message: "Pick what the request is about" }),
  subject: z.string().trim().min(3, "Write a short subject").max(120, "Keep the subject under 120 characters"),
  body: z.string().trim().min(10, "Add a few more details (at least 10 characters)").max(3000, "Keep the message under 3000 characters"),
});

export async function createRequest(input: z.input<typeof newSchema>): Promise<Result<{ id: string }>> {
  const { supabase } = await requireRole("employee");
  const parsed = newSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  const { data, error } = await supabase.rpc("create_hr_request", { p_category: v.category, p_subject: v.subject, p_body: v.body });
  if (error) return { ok: false, error: dbError(error, "Could not send the request.") };
  // Email to admins can be added here later; for now admins see it in the portal (menu badge).
  revalidatePath("/app/requests");
  revalidatePath("/admin", "layout");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function replyAsEmployee(id: string, body: string): Promise<Result> {
  const { supabase } = await requireRole("employee");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Request not found." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > 3000) return { ok: false, error: "Keep the message under 3000 characters." };
  const { error } = await supabase.rpc("reply_hr_request", { p_id: id, p_body: text });
  if (error) return { ok: false, error: dbError(error, "Could not send the message.") };
  revalidatePath(`/app/requests/${id}`);
  return { ok: true };
}

export async function withdrawRequest(id: string): Promise<Result> {
  const { supabase } = await requireRole("employee");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Request not found." };
  const { error } = await supabase.rpc("set_hr_request_status", { p_id: id, p_status: "withdrawn" });
  if (error) return { ok: false, error: dbError(error, "Could not withdraw the request.") };
  revalidatePath(`/app/requests/${id}`);
  return { ok: true };
}

export async function markSeenEmployee(id: string) {
  const { supabase } = await requireRole("employee");
  if (uuid.safeParse(id).success) await supabase.rpc("mark_hr_request_seen", { p_id: id });
}

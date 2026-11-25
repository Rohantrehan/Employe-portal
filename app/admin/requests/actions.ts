"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

const dbError = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);
const uuid = z.string().uuid();

export async function replyAsAdmin(id: string, body: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Request not found." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > 3000) return { ok: false, error: "Keep the message under 3000 characters." };
  const { error } = await supabase.rpc("reply_hr_request", { p_id: id, p_body: text });
  if (error) return { ok: false, error: dbError(error, "Could not send the reply.") };
  revalidatePath("/admin/requests", "layout");
  return { ok: true };
}

export async function setRequestStatus(id: string, status: "open" | "in_progress" | "resolved"): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(id).success || !["open", "in_progress", "resolved"].includes(status)) return { ok: false, error: "Request not found." };
  const { error } = await supabase.rpc("set_hr_request_status", { p_id: id, p_status: status });
  if (error) return { ok: false, error: dbError(error, "Could not change the status.") };
  revalidatePath("/admin/requests", "layout");
  return { ok: true };
}

export async function markSeenAdmin(id: string) {
  const { supabase } = await requireRole("admin");
  if (uuid.safeParse(id).success) await supabase.rpc("mark_hr_request_seen", { p_id: id });
}

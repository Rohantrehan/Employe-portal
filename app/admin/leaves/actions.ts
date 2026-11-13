"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true } | { ok: false; error: string };

const msg = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);

function revalidate() {
  revalidatePath("/admin/leaves");
  revalidatePath("/app/leaves");
  revalidatePath("/admin/today");
}

export async function reviewLeave(id: string, approve: boolean, note: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.rpc("review_leave", { p_id: id, p_approve: approve, p_note: note });
  if (error) return { ok: false, error: msg(error, "Could not update the request.") };
  revalidate();
  return { ok: true };
}

export async function attachmentUrl(path: string) {
  const { supabase } = await requireRole("admin");
  const { data, error } = await supabase.storage.from("leave-attachments").createSignedUrl(path, 60);
  if (error || !data) return { ok: false as const, error: "Could not open the file." };
  return { ok: true as const, url: data.signedUrl };
}

export async function ensureYear(year: number): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.rpc("ensure_leave_year", { p_year: year });
  if (error) return { ok: false, error: msg(error, "Could not set up the year.") };
  revalidate();
  return { ok: true };
}

const quota = z.coerce.number().min(0, "Can't be negative").max(365, "Too many days").multipleOf(0.5, "Use whole or half days");

/** Set a type's yearly quota. Optionally reset every employee's allotment for that year to it. */
export async function setQuota(typeId: string, year: number, value: number, applyToAll: boolean): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const q = quota.safeParse(value);
  if (!q.success) return { ok: false, error: q.error.issues[0].message };

  const { error } = await supabase
    .from("leave_policies")
    .upsert({ leave_type_id: typeId, year, default_quota: q.data, carry_forward: false, max_carry: 0 }, { onConflict: "leave_type_id,year" });
  if (error) return { ok: false, error: "Could not save the quota." };

  await supabase.rpc("ensure_leave_year", { p_year: year });
  if (applyToAll) {
    const { error: e2 } = await supabase.from("leave_balances").update({ allotted: q.data }).eq("leave_type_id", typeId).eq("year", year);
    if (e2) return { ok: false, error: "Quota saved, but updating employees failed." };
  }
  await supabase.rpc("log_action", { p_action: "leave.quota", p_entity: "leave_type", p_entity_id: typeId, p_payload: { year, quota: q.data, applyToAll } });
  revalidate();
  return { ok: true };
}

/** Override one employee's allotment for one type/year. */
export async function setAllotment(balanceId: string, value: number): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const q = quota.safeParse(value);
  if (!q.success) return { ok: false, error: q.error.issues[0].message };
  const { data: b } = await supabase.from("leave_balances").select("used, pending").eq("id", balanceId).single();
  if (!b) return { ok: false, error: "Balance not found." };
  if (q.data < Number(b.used) + Number(b.pending)) {
    return { ok: false, error: `Can't go below ${Number(b.used) + Number(b.pending)}: that much is already used or pending.` };
  }
  const { error } = await supabase.from("leave_balances").update({ allotted: q.data }).eq("id", balanceId);
  if (error) return { ok: false, error: "Could not save." };
  await supabase.rpc("log_action", { p_action: "leave.allotment", p_entity: "leave_balance", p_entity_id: balanceId, p_payload: { allotted: q.data } });
  revalidate();
  return { ok: true };
}

const typeSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(40),
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/, "2–6 capital letters, e.g. ML"),
  is_paid: z.boolean(),
  tracks_balance: z.boolean(),
  requires_attachment: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
  is_active: z.boolean(),
});

export async function saveLeaveType(id: string | null, v: z.input<typeof typeSchema>, year: number): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const p = typeSchema.safeParse(v);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };

  if (id) {
    const { error } = await supabase.from("leave_types").update(p.data).eq("id", id);
    if (error) return { ok: false, error: error.code === "23505" ? "That code is already used." : "Could not save." };
  } else {
    const { data: last } = await supabase.from("leave_types").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const { error } = await supabase.from("leave_types").insert({ ...p.data, sort_order: (last?.sort_order ?? 0) + 1 });
    if (error) return { ok: false, error: error.code === "23505" ? "That code is already used." : "Could not add the type." };
  }
  await supabase.rpc("ensure_leave_year", { p_year: year });
  await supabase.rpc("log_action", { p_action: id ? "leave_type.update" : "leave_type.create", p_entity: "leave_type", p_entity_id: id ?? p.data.code, p_payload: p.data });
  revalidate();
  return { ok: true };
}

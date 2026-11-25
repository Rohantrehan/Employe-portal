"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";

export type Result = { ok: true; message?: string } | { ok: false; error: string };

const msg = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);
const money = z.coerce.number({ message: "Enter an amount" }).min(0, "Can't be negative").max(100_000_000, "Too large");

const rowSchema = z.object({
  employeeId: z.string().uuid(),
  name: z.string(),
  basic: money,
  excellence: money,
  rating: z.coerce.number().refine((v) => [3, 3.5, 4, 4.5, 5].includes(v), "Pick a rating: 5, 4.5, 4, 3.5 or 3"),
  night: money,
  remarks: z.string().trim().max(500, "Remarks can be at most 500 characters").default(""),
});

function revalidate() {
  revalidatePath("/admin/payroll");
  revalidatePath("/app/payslips");
}

export async function saveDrafts(month: string, rows: z.input<typeof rowSchema>[]): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Invalid month." };
  let saved = 0;
  for (const raw of rows) {
    const r = rowSchema.safeParse(raw);
    if (!r.success) return { ok: false, error: `${raw.name}: ${r.error.issues[0].message}` };
    const { error } = await supabase.rpc("save_payslip", {
      p_employee: r.data.employeeId,
      p_month: `${month}-01`,
      p_basic: r.data.basic,
      p_excellence: r.data.excellence,
      p_rating: r.data.rating,
      p_night: r.data.night,
      p_remarks: r.data.remarks,
    });
    if (error) {
      revalidate();
      return { ok: false, error: `${r.data.name}: ${msg(error, "could not save")}${saved ? ` (${saved} saved before this)` : ""}` };
    }
    saved++;
  }
  await supabase.rpc("log_action", { p_action: "payroll.save", p_entity: "payroll", p_entity_id: month, p_payload: { count: saved } });
  revalidate();
  return { ok: true, message: `${saved} payslip${saved === 1 ? "" : "s"} saved as draft` };
}

export async function setPublished(ids: string[], publish: boolean): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!ids.length) return { ok: false, error: "Nothing selected." };
  const { data, error } = await supabase.rpc("set_payslips_published", { p_ids: ids, p_publish: publish });
  if (error) return { ok: false, error: msg(error, "Could not update the payslips.") };
  revalidate();
  const n = Number(data ?? 0);
  return { ok: true, message: publish ? `${n} payslip${n === 1 ? "" : "s"} published. Employees can now see and download them.` : "Payslip moved back to draft" };
}

export async function setPaid(id: string, paid: boolean, paidOn: string | null, ref: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (paid && (!paidOn || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn))) return { ok: false, error: "Enter the payment date." };
  const { error } = await supabase.rpc("set_payslip_paid", { p_id: id, p_paid: paid, p_paid_on: paid ? paidOn : null, p_ref: ref.slice(0, 100) });
  if (error) return { ok: false, error: msg(error, "Could not update the payment.") };
  revalidate();
  return { ok: true, message: paid ? "Marked as paid" : "Marked as unpaid" };
}

export async function deleteDraft(id: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  const { error } = await supabase.rpc("delete_payslip_draft", { p_id: id });
  if (error) return { ok: false, error: msg(error, "Could not delete the draft.") };
  revalidate();
  return { ok: true, message: "Draft deleted" };
}

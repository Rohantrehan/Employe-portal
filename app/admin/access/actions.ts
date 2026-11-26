"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { encrypt, normaliseTotpSecret, vaultReady } from "@/lib/vault";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const dbError = (e: { code?: string; message: string }, fallback: string) => (e.code === "P0001" ? e.message : fallback);
const uuid = z.string().uuid();

function refresh(employeeId?: string) {
  revalidatePath("/admin/access", "layout");
  revalidatePath("/admin");
  if (employeeId) revalidatePath(`/admin/employees/${employeeId}`);
}

const itemSchema = z.object({
  id: uuid.nullable(),
  name: z.string().trim().min(2, "Enter the account name").max(80, "Keep the name under 80 characters"),
  url: z.string().trim().max(300, "That link is too long").refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), "The sign-in link must start with https://"),
  username: z.string().trim().max(200, "The username is too long"),
  password: z.string().max(500, "The password is too long"), // "" = keep (when editing)
  notes: z.string().max(3000, "Keep the notes under 3000 characters"), // "" = keep
  clearNotes: z.boolean(),
  totp: z.string().max(500), // "" = keep
  clearTotp: z.boolean(),
});

/** Create or edit a shared account. Secrets are encrypted here before they go to the database. */
export async function saveVaultItem(input: z.input<typeof itemSchema>): Promise<Result<{ id: string }>> {
  const { supabase } = await requireRole("admin");
  if (!vaultReady()) return { ok: false, error: "The access manager isn't set up yet (VAULT_KEY is missing)." };
  const parsed = itemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const v = parsed.data;
  if (!v.id && !v.password) return { ok: false, error: "Enter the password." };

  let totpSecret: string | null = null;
  if (v.totp.trim() && !v.clearTotp) {
    totpSecret = normaliseTotpSecret(v.totp);
    if (!totpSecret) return { ok: false, error: "That authenticator key doesn't look right. Paste the setup key (letters A–Z and 2–7) or the otpauth:// link." };
  }

  const id = v.id ?? randomUUID();
  const { error } = await supabase.rpc("vault_save_item", {
    p_id: id,
    p_name: v.name,
    p_url: v.url,
    p_username: v.username,
    p_password_enc: v.password ? encrypt(id, "password", v.password) : null,
    p_notes_enc: v.clearNotes ? "" : v.notes.trim() ? encrypt(id, "notes", v.notes.trim()) : null,
    p_totp_enc: v.clearTotp ? "" : totpSecret ? encrypt(id, "totp", totpSecret) : null,
  });
  if (error) return { ok: false, error: dbError(error, "Could not save the account.") };
  refresh();
  return { ok: true, data: { id } };
}

export async function archiveVaultItem(id: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(id).success) return { ok: false, error: "Account not found." };
  const { error } = await supabase.rpc("vault_archive_item", { p_id: id });
  if (error) return { ok: false, error: dbError(error, "Could not remove the account.") };
  refresh();
  return { ok: true };
}

export async function grantAccess(itemId: string, employeeId: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if (!uuid.safeParse(itemId).success || !uuid.safeParse(employeeId).success) return { ok: false, error: "Pick an employee." };
  const { error } = await supabase.rpc("vault_grant", { p_item: itemId, p_employee: employeeId });
  if (error) return { ok: false, error: dbError(error, "Could not give access.") };
  refresh(employeeId);
  return { ok: true };
}

/** Remove one account from someone, or everything they have (itemId null). */
export async function revokeAccess(itemId: string | null, employeeId: string): Promise<Result> {
  const { supabase } = await requireRole("admin");
  if ((itemId && !uuid.safeParse(itemId).success) || !uuid.safeParse(employeeId).success) return { ok: false, error: "Not found." };
  const { error } = await supabase.rpc("vault_revoke", { p_item: itemId, p_employee: employeeId });
  if (error) return { ok: false, error: dbError(error, "Could not remove access.") };
  refresh(employeeId);
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

export type ProfileState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string> } | undefined;

const fieldErrors = (issues: z.core.$ZodIssue[]) => {
  const out: Record<string, string> = {};
  for (const i of issues) out[String(i.path[0])] ??= i.message;
  return out;
};

export async function savePhone(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const { supabase } = await requireRole("employee");
  const { error } = await supabase.rpc("update_my_phone", { p_phone: String(formData.get("phone") ?? "") });
  if (error) return { error: error.code === "P0001" ? error.message : "Could not save your phone number." };
  revalidatePath("/app/profile");
  return { ok: true, message: "Phone number saved." };
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Use at most 72 characters")
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Choose a password different from your current one" });

export async function changeMyPassword(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const { supabase, profile } = await requireRole("employee");
  const parsed = passwordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error.issues) };

  // Confirm the current password with a throwaway client, so the real session is untouched.
  const check = createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: profile.email, password: parsed.data.current });
  if (wrong) return { fieldErrors: { current: "Current password is incorrect" } };
  await check.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Could not update the password. Please try again." };
  return { ok: true, message: "Password changed." };
}

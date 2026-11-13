"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { homeFor, type Role } from "@/lib/auth";

export type FormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // Same message for wrong email or wrong password, so accounts can't be probed.
    const banned = error?.message?.toLowerCase().includes("banned");
    return { error: banned ? "This account has been deactivated. Please contact your admin." : "Incorrect email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active, must_change_password")
    .eq("id", data.user.id)
    .single<{ role: Role; is_active: boolean; must_change_password: boolean }>();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return { error: "This account has been deactivated. Please contact your admin." };
  }

  redirect(profile.must_change_password ? "/change-password" : homeFor(profile.role));
}

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters")
      .max(72, "Use at most 72 characters")
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = passwordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const same = error.message.toLowerCase().includes("different");
    return { error: same ? "Choose a password different from your current one." : "Could not update the password. Please try again." };
  }

  await supabase.rpc("mark_password_changed");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single<{ role: Role }>();
  redirect(homeFor(profile?.role ?? "employee"));
}

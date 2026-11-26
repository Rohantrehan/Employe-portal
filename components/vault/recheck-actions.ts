"use server";

import { getSession } from "@/lib/auth";

/** A fresh authenticator code before showing shared passwords (good for 10 minutes). */
export async function recheckCode(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session?.profile?.is_active) return { ok: false, error: "Please log in again." };
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return { ok: false, error: "Enter the 6-digit code from your app." };
  const { supabase } = session;
  const { data } = await supabase.auth.mfa.listFactors();
  const factor = data?.all.find((f) => f.factor_type === "totp" && f.status === "verified");
  if (!factor) return { ok: false, error: "Set up 2-step sign-in first (log out and in again)." };
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: clean });
  if (error) {
    return { ok: false, error: error.status === 429 ? "Too many tries. Wait a minute and try again." : "That code didn't work. Use the newest code in your app." };
  }
  await supabase.rpc("log_my_2fa", { p_action: "2fa.recheck" });
  return { ok: true };
}

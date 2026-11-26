"use server";

import { getSession, hasAdminRights, homeFor, isFormer } from "@/lib/auth";

export type EnrollResult = { ok: true; factorId: string; qr: string; secret: string } | { ok: false; error: string };
export type VerifyResult = { ok: true; next: string } | { ok: false; error: string };

const ISSUER = "RohTre Media Portal";

async function adminSession() {
  const session = await getSession();
  // Everyone who still works here (people who have left use password only).
  if (!session?.profile || !session.profile.is_active || isFormer(session.profile)) return null;
  return session;
}

/** Starts authenticator-app setup: returns the QR code and the key to type in by hand. */
export async function startEnroll(): Promise<EnrollResult> {
  const session = await adminSession();
  if (!session) return { ok: false, error: "Please log in again." };
  const { supabase } = session;

  const { data: list, error: le } = await supabase.auth.mfa.listFactors();
  if (le) return { ok: false, error: "Could not start setup. Please try again." };
  if (list.all.some((f) => f.factor_type === "totp" && f.status === "verified")) {
    return { ok: false, error: "An authenticator app is already set up. Enter its code instead." };
  }
  // Clear half-finished attempts so the new QR code is the only one.
  for (const f of list.all.filter((f) => f.status !== "verified")) await supabase.auth.mfa.unenroll({ factorId: f.id });

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`, issuer: ISSUER });
  if (error || !data) return { ok: false, error: "Could not start setup. Please try again." };
  return { ok: true, factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks a 6-digit code. On success the session is upgraded (aal2) and the cookie updated. */
export async function verifyCode(factorId: string, code: string, firstTime: boolean): Promise<VerifyResult> {
  const session = await adminSession();
  if (!session) return { ok: false, error: "Please log in again." };
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6) return { ok: false, error: "Enter the 6-digit code from your app." };
  if (!/^[0-9a-f-]{36}$/i.test(factorId)) return { ok: false, error: "Please reload the page and try again." };

  const { supabase } = session;
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: clean });
  if (error) {
    return {
      ok: false,
      error: error.status === 429 ? "Too many tries. Wait a minute and try again." : "That code didn't work. Use the newest code in your app and check your phone's time is automatic.",
    };
  }
  if (hasAdminRights(session.profile!)) {
    await supabase.rpc("log_action", { p_action: firstTime ? "admin.2fa_setup" : "admin.2fa_login", p_entity: "profile", p_entity_id: session.user.id, p_payload: null });
  } else {
    await supabase.rpc("log_my_2fa", { p_action: firstTime ? "2fa.setup" : "2fa.login" });
  }
  const p = session.profile!;
  return { ok: true, next: p.must_change_password ? "/change-password" : homeFor(p) };
}

/** "Use a different phone": removes your own authenticator so you can set it up again. Needs a 2-step session. */
export async function resetMyFactor(): Promise<VerifyResult> {
  const session = await adminSession();
  if (!session || session.aal !== "aal2") return { ok: false, error: "Please log in again." };
  const { supabase } = session;
  const { data } = await supabase.auth.mfa.listFactors();
  if (hasAdminRights(session.profile!)) await supabase.rpc("log_action", { p_action: "admin.2fa_reset_self", p_entity: "profile", p_entity_id: session.user.id, p_payload: null });
  for (const f of data?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { ok: false, error: "Could not remove the old app. Please try again." };
  }
  return { ok: true, next: "/mfa" };
}

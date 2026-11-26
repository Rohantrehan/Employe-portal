import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/format";

export type Role = "admin" | "employee";

export type Profile = {
  id: string;
  role: Role;
  emp_code: string;
  full_name: string;
  email: string;
  designation: string | null;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  left_on: string | null;
  former_access: boolean;
  /** An employee who also has full admin rights (and clocks in like everyone else). */
  is_hr: boolean;
};

/** Admin panel access: admins and HR. */
export const hasAdminRights = (p: Pick<Profile, "role" | "is_hr">) => p.role === "admin" || (p.role === "employee" && p.is_hr);

export const homeFor = (p: Pick<Profile, "role" | "is_hr">) => (hasAdminRights(p) ? "/admin" : "/app");

/**
 * Current user + profile, cached for the duration of one request.
 * getClaims() verifies the JWT locally against the project's (cached) public signing key,
 * so there is no round trip to Supabase Auth on every page. Deactivated users are still
 * caught by the profile check below (is_active), and RLS protects the data itself.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const user = { id: claims.sub, email: (claims.email as string | undefined) ?? null };
  // "aal2" once the authenticator-app step is done (required for admins).
  const aal = (claims.aal as string | undefined) ?? "aal1";
  // RPC, not the table: it works before the 2-step code is entered (the API refuses everything else until then).
  const { data: rows } = await supabase.rpc("my_account");
  const profile = ((rows ?? []) as Profile[])[0] ?? null;
  return { user, profile, supabase, aal };
});

/**
 * Guard for server layouts/pages/actions. Redirects when:
 * - not logged in → /login
 * - left (past last working day) → /former (documents only)
 * - inactive or no profile → /login?error=inactive
 * - no authenticator-app step yet → /mfa (everyone)
 * - must change password → /change-password
 * - wrong role → that role's home (HR may use both areas)
 */
export async function requireRole(role: Role) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile } = session;
  // Past their last working day → documents-only area (or out, if the admin turned that off).
  if (profile && isFormer(profile)) redirect(profile.former_access ? "/former" : "/auth/logout?reason=inactive");
  if (!profile || !profile.is_active) redirect("/auth/logout?reason=inactive");
  if (session.aal !== "aal2") redirect("/mfa");
  if (profile.must_change_password) redirect("/change-password");
  const allowed = role === "admin" ? hasAdminRights(profile) : profile.role === "employee";
  if (!allowed) redirect(homeFor(profile));
  return { ...session, profile };
}

/** Past their last working day (the nightly job may not have flipped is_active yet). */
export function isFormer(p: Pick<Profile, "role" | "left_on">) {
  return p.role === "employee" && !!p.left_on && p.left_on < todayIST();
}

/** Guard for the documents-only area of people who have left. */
export async function requireFormer() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile } = session;
  if (!profile) redirect("/auth/logout?reason=inactive");
  if (!isFormer(profile)) redirect(profile.is_active ? homeFor(profile) : "/auth/logout?reason=inactive");
  if (!profile.former_access) redirect("/auth/logout?reason=inactive");
  if (profile.must_change_password) redirect("/change-password");
  return { ...session, profile };
}

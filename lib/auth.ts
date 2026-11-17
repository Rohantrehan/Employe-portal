import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
};

export const homeFor = (role: Role) => (role === "admin" ? "/admin" : "/app");

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
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, emp_code, full_name, email, designation, avatar_url, is_active, must_change_password")
    .eq("id", user.id)
    .single<Profile>();
  return { user, profile, supabase };
});

/**
 * Guard for server layouts/pages/actions. Redirects when:
 * - not logged in → /login
 * - inactive or no profile → /login?error=inactive
 * - must change password → /change-password
 * - wrong role → that role's home
 */
export async function requireRole(role: Role) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { profile } = session;
  if (!profile || !profile.is_active) redirect("/auth/logout?reason=inactive");
  if (profile.must_change_password) redirect("/change-password");
  if (profile.role !== role) redirect(homeFor(profile.role));
  return { ...session, profile };
}

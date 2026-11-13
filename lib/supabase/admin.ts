import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/** Service-role client. Server-only: bypasses RLS. Use only inside admin server actions after checking the caller is an admin. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing in .env.local");
  return createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

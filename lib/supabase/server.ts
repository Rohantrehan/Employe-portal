import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

export async function createClient() {
  // Read cookies first: this marks every caller as dynamic (never pre-rendered at build time).
  const cookieStore = await cookies();
  assertSupabaseEnv();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component; middleware refreshes the session.
        }
      },
    },
  });
}

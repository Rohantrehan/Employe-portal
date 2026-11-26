import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt, totp, vaultReady } from "@/lib/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

/**
 * Reveal one secret of a shared account: the password, the notes, or the current
 * authenticator code (the code's key itself never leaves the server).
 * The database checks access (admin, or an active grant for an active employee),
 * rate-limits and logs the reveal, then returns the encrypted value, which is
 * decrypted here with VAULT_KEY.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Same-site only: block other sites from triggering reveals with the user's cookie.
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.headers.get("host")) return fail("Bad request.", 403);

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return fail("Not found.", 404);
  const body = (await request.json().catch(() => null)) as { what?: string } | null;
  const what = body?.what;
  if (what !== "password" && what !== "code" && what !== "notes") return fail("Bad request.", 400);
  if (!vaultReady()) return fail("The access manager isn't set up yet (VAULT_KEY is missing).", 503);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return fail("Please sign in again.", 401);

  const { data, error } = await supabase.rpc("vault_secret", { p_item: id, p_what: what });
  // Needs a fresh authenticator code (older than 10 minutes): the page asks for one and retries.
  if (error?.hint === "step_up") return NextResponse.json({ error: error.message, stepUp: true }, { status: 401, headers: NO_STORE });
  if (error) return fail(error.code === "P0001" || error.code === "42501" ? error.message : "Could not open this account.", error.code === "42501" ? 403 : 400);

  try {
    if (what === "code") {
      const { code, secondsLeft } = totp(decrypt(id, "totp", data as string));
      return NextResponse.json({ code, secondsLeft }, { headers: NO_STORE });
    }
    return NextResponse.json({ value: decrypt(id, what, data as string) }, { headers: NO_STORE });
  } catch {
    return fail("This value can't be read. It may have been saved with a different key.", 500);
  }
}

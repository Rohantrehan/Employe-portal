import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function logout(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const reason = request.nextUrl.searchParams.get("reason") === "inactive" ? "inactive" : "signed-out";
  return NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url), { status: 303 });
}

export const POST = logout;
// GET is used by server-side redirects (e.g. deactivated account). Logging out is harmless.
export const GET = logout;

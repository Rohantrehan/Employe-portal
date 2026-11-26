import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login", "/auth", "/styleguide", "/verify"];
const isPublic = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

/**
 * Refreshes the Supabase session cookie on every request and does a fast
 * first-pass route guard. The real checks (role, active, must-change-password)
 * happen in server layouts via lib/auth.ts, and the data itself is protected by RLS.
 */
export async function middleware(request: NextRequest) {
  if (!supabaseConfigured) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Verified locally with the project's public signing key (no network call per request).
  // Also refreshes an expired session and writes the new cookies via setAll above.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { app_metadata: data.claims.app_metadata, aal: data.claims.aal as string | undefined } : null;
  const path = request.nextUrl.pathname;

  const redirectTo = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user && !isPublic(path)) return redirectTo("/login");

  if (user) {
    // role lives in app_metadata (set server-side only), so no DB call is needed here
    const meta = user.app_metadata as { role?: string; hr?: boolean } | undefined;
    const role = meta?.role === "admin" ? "admin" : "employee";
    // HR: an employee with admin rights; uses both areas.
    const hr = role === "employee" && meta?.hr === true;
    const adminRights = role === "admin" || hr;
    const home = adminRights ? "/admin" : "/app";
    // Everyone passes the authenticator-app step before anything else. People who have
    // left only use /former (password only); its page and the database check that.
    const passOk = (p: string) => p === "/mfa" || p === "/former" || p === "/change-password" || p.startsWith("/api/") || isPublic(p);
    if (user.aal !== "aal2" && !passOk(path)) return redirectTo("/mfa");
    if (user.aal !== "aal2" && path === "/login") return redirectTo("/mfa");
    if (path === "/" || path === "/login") return redirectTo(home);
    // Wrong area → own home (layouts re-check this against the database)
    if (!adminRights && (path === "/admin" || path.startsWith("/admin/"))) return redirectTo(home);
    if (role === "admin" && (path === "/app" || path.startsWith("/app/") || path === "/former")) return redirectTo(home);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logos/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};

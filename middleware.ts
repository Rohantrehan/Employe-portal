import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "@/lib/supabase/env";

const PUBLIC_PATHS = ["/login", "/auth", "/styleguide"];
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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  if (user && (path === "/" || path === "/login")) {
    // role lives in app_metadata (set server-side only), so no DB call is needed here
    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    return redirectTo(role === "admin" ? "/admin" : "/app");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|logos/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};

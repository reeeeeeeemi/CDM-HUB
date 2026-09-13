import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Runs before every matched request and refreshes the Supabase auth token.
 *
 * Server Components cannot write cookies, so without this the session would
 * silently expire and users would be logged out at random.
 *
 * Renamed from `middleware` to `proxy` in Next.js 16.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
        // Responses that set auth cookies must never be cached by a CDN.
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value)
        );
      },
    },
  });

  // Do not add code between createServerClient and getUser(): the token
  // refresh must happen first, or the session can end up out of sync.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Optimistic check only — it saves rendering a page the visitor cannot see.
  // The real authorisation lives in app/page.tsx and in the RLS policies.
  const { pathname } = request.nextUrl;
  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every path except static assets and image files, which never
     * need a session refresh.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

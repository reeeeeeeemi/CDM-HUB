import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_OPTIONS, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

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
    cookieOptions: COOKIE_OPTIONS,
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
  // /invite doit être atteint sans compte : la page y construit elle-même le
  // retour vers le jeton une fois l'inscription faite.
  //
  // /event aussi, et pour une autre raison : WhatsApp et Messenger chargent
  // le lien depuis leurs serveurs, sans cookie, pour en tirer un aperçu. Une
  // redirection vers /login leur ferait afficher l'écran de connexion à la
  // place du plan. La page décide elle-même quoi montrer à un non-membre.
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/event") ||
    // La tâche planifiée appelle /api/digest sans session : redirigée vers
    // /login, elle ne notifierait jamais personne. La route se garde
    // elle-même, par le secret de Vercel et celui de la fonction SQL.
    pathname.startsWith("/api");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Garde la destination, pour y revenir une fois connecté.
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  // L'inverse : un visiteur connecté n'a rien à faire sur /login. Sans cela,
  // le bouton retour du navigateur l'y renvoie. /auth/* est exclu — l'écran
  // de nouveau mot de passe a justement besoin d'une session ouverte.
  if (user && pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Décourage la mise en cache de l'écran de connexion : un retour arrière
  // ne doit pas ressortir une page devenue sans objet.
  if (pathname.startsWith("/login")) {
    response.headers.set("Cache-Control", "no-store, must-revalidate");
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match every path except static assets and image files, which never
     * need a session refresh.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

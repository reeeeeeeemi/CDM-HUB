import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { COOKIE_OPTIONS, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Create a new one per request — never share it across requests, or a
 * session could leak from one user to another.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components cannot write cookies. This is safe to ignore
          // because proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * L'utilisateur de la session, null s'il n'y en a pas.
 *
 * getUser valide le jeton auprès de Supabase. getSession se contenterait de
 * lire le cookie, qui est falsifiable — ne jamais s'en servir pour décider
 * d'un accès côté serveur.
 *
 * Supabase injoignable n'est pas « déconnecté » : renvoyer null mènerait à
 * /login, et l'on se retrouvait sur l'écran de connexion avec une session
 * intacte. On lève l'erreur, app/error.tsx propose de réessayer.
 */
export async function currentUser(supabase: Client) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (isAuthRetryableFetchError(error)) throw error;
  return user;
}

/**
 * La même chose pour les Server Actions, qui rendent leurs erreurs au
 * formulaire plutôt que de les lever.
 */
export async function actionUser(
  supabase: Client
): Promise<{ user: User; error: null } | { user: null; error: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (isAuthRetryableFetchError(error)) {
    return { user: null, error: "Pas de réseau. Réessaie dans un instant." };
  }
  if (!user) return { user: null, error: "Session expirée." };
  return { user, error: null };
}

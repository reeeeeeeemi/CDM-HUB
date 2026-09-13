import { createServerClient } from "@supabase/ssr";
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

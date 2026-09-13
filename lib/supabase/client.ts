import { createBrowserClient } from "@supabase/ssr";

import { COOKIE_OPTIONS, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client for Client Components. Reads and writes the session from
 * browser cookies, so it stays in sync with the server client.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: COOKIE_OPTIONS,
  });
}

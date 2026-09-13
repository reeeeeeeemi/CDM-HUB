/**
 * Reads the Supabase credentials from the environment and fails loudly when
 * one is missing, instead of letting the client throw a cryptic error later.
 */
function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Add it to .env.local (see .env.example).`
    )
  }
  return value
}

export const SUPABASE_URL = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL
)

export const SUPABASE_ANON_KEY = required(
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/**
 * Durée de vie des cookies de session : 400 jours, le plafond imposé par les
 * navigateurs. Sans ça, le cookie expire bien avant le jeton de
 * rafraîchissement et l'utilisateur se retrouve déconnecté sans raison.
 */
export const COOKIE_OPTIONS = { maxAge: 400 * 24 * 60 * 60 };

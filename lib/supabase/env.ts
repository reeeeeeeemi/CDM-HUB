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

/**
 * La pré-prod : le projet Supabase « Bouyave HUB ». Les versions de test de
 * Vercel (Preview) s'y branchent toujours, la prod jamais.
 *
 * En dur plutôt qu'en variables Vercel : l'équipe impose le type « secret »
 * aux nouvelles variables, ce qu'un NEXT_PUBLIC_ ne peut pas être. Rien de
 * confidentiel ici — l'adresse et la clé publique partent de toute façon
 * dans le navigateur, et c'est le RLS qui protège les données.
 */
const PREPROD = {
  url: "https://tbdsvmxqlsjonlofhonl.supabase.co",
  key: "sb_publishable_pQfKe5yJYKjJ5DYhJSfHgw_QwD5QITx",
}

const isPreview = process.env.HUB_STAGE === "preview"

export const SUPABASE_URL = isPreview
  ? PREPROD.url
  : required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL)

export const SUPABASE_ANON_KEY = isPreview
  ? PREPROD.key
  : required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

/**
 * Durée de vie des cookies de session : 400 jours, le plafond imposé par les
 * navigateurs. Sans ça, le cookie expire bien avant le jeton de
 * rafraîchissement et l'utilisateur se retrouve déconnecté sans raison.
 */
export const COOKIE_OPTIONS = { maxAge: 400 * 24 * 60 * 60 };

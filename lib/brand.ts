/**
 * Identité du groupe.
 *
 * Tout passe par des variables d'environnement, pour qu'un même code puisse
 * servir plusieurs bandes d'amis : un second projet Vercel branché sur ce
 * dépôt, avec ses propres valeurs et sa propre base, et c'est une autre app.
 *
 * Les valeurs par défaut sont celles du CDM : un déploiement qui ne définit
 * rien reste exactement l'app d'origine.
 *
 * Toutes en NEXT_PUBLIC_ — rien de secret ici, et ces textes s'affichent
 * aussi bien côté serveur (titre, manifeste) que dans le navigateur.
 */

export const GROUP = process.env.NEXT_PUBLIC_GROUP_NAME || "CDM";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || `HUB Events ${GROUP}`;

export const APP_SHORT = process.env.NEXT_PUBLIC_APP_SHORT || `HUB ${GROUP}`;

export const TAGLINE =
  process.env.NEXT_PUBLIC_TAGLINE ||
  `Pour retrouver tous les évènements organisés par le ${GROUP}, du voyage annuel au ski jusqu'à la coinche du mardi où Kenny est encore le pire joueur autour de la table.`;

export const DESCRIPTION =
  process.env.NEXT_PUBLIC_DESCRIPTION ||
  `Tous les évènements du ${GROUP}, du voyage annuel au ski jusqu'à la coinche du mardi.`;

/**
 * Villes proposées, sous la forme « Toulouse:🌸,Bordeaux:🍷 ».
 *
 * Ce ne sont que des raccourcis : le champ ville reste libre, et une ville
 * absente de la liste garde une épingle en guise d'emoji.
 */
function parseCities(raw: string | undefined) {
  if (!raw) return null;
  const out: Record<string, string> = {};
  for (const part of raw.split(",")) {
    const [name, emoji] = part.split(":");
    const key = (name || "").trim();
    if (key) out[key] = (emoji || "").trim() || "📍";
  }
  return Object.keys(out).length > 0 ? out : null;
}

export const CITIES: Record<string, string> =
  parseCities(process.env.NEXT_PUBLIC_CITIES) || {
    Toulouse: "🌸",
    Bordeaux: "🍷",
    Paris: "🗼",
    Casablanca: "🕌",
    Rome: "🏛️",
  };

/**
 * Identité de l'appli, commune à tous les groupes.
 *
 * Celle de chaque groupe — nom, emoji, phrase d'accueil, villes — vit en
 * base, dans la table groups (voir lib/group.ts).
 *
 * Le nom reste surchargeable par variable d'environnement, le temps d'en
 * choisir un pour de bon.
 */

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "HUB Events";

export const APP_SHORT = process.env.NEXT_PUBLIC_APP_SHORT || "HUB";

export const TAGLINE =
  "Le QG des plans de ta bande : ce qui arrive, ce qu'on propose, qui est chaud.";

export const DESCRIPTION = TAGLINE;

/**
 * Ce qu'un groupe apporte à l'appli : son nom, ses villes, ses catégories.
 *
 * Partagé entre serveur et navigateur — rien ici ne touche à la base.
 */

export type City = { name: string; emoji: string };

export type Group = {
  id: string;
  name: string;
  emoji: string | null;
  tagline: string | null;
  cities: City[];
  categories: string[];
};

/** Ce que la liste des groupes affiche, pour passer de l'un à l'autre. */
export type GroupChip = { id: string; name: string; emoji: string | null };

export type Role = "admin" | "member";

/**
 * Le groupe ouvert, retenu d'une visite à l'autre. Il ne fait que choisir
 * parmi les groupes dont on est membre : readViewer revérifie à chaque fois,
 * un cookie trafiqué ne donne accès à rien.
 */
export const GROUP_COOKIE = "hub_group";

/** Une ville hors de la liste du groupe garde une épingle. */
export const cityEmoji = (cities: City[], name: string) =>
  cities.find((c) => c.name === name)?.emoji || "📍";

/**
 * La base renvoie le jsonb tel quel : on n'en garde que ce qui a la bonne
 * forme, pour qu'une ligne abîmée ne fasse pas tomber l'écran.
 */
export function toGroup(row: Record<string, unknown>): Group {
  const cities = Array.isArray(row.cities)
    ? (row.cities as unknown[]).flatMap((c) => {
        const x = c as { name?: unknown; emoji?: unknown };
        return typeof x?.name === "string" && x.name
          ? [{ name: x.name, emoji: typeof x.emoji === "string" && x.emoji ? x.emoji : "📍" }]
          : [];
      })
    : [];
  return {
    id: String(row.id),
    name: String(row.name),
    emoji: (row.emoji as string | null) ?? null,
    tagline: (row.tagline as string | null) ?? null,
    cities,
    categories: Array.isArray(row.categories) ? (row.categories as string[]) : [],
  };
}

/** Les deux premières initiales, quand le groupe n'a pas d'emoji. */
export const groupBadge = (g: { name: string; emoji: string | null }) =>
  g.emoji || g.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/** Le message de la base quand un pseudo est déjà pris dans le groupe. */
export const isPseudoTaken = (e: { code?: string; message?: string } | null) =>
  Boolean(e && (e.code === "23505" || e.message?.includes("members_group_pseudo_key")));

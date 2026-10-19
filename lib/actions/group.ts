"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { GROUP_COOKIE, type City } from "@/lib/group";
import { CATEGORIES, MAX_CATEGORIES, MIN_CATEGORIES } from "@/lib/catalog";
import { COOKIE_OPTIONS } from "@/lib/supabase/env";

async function setGroupCookie(groupId: string) {
  (await cookies()).set(GROUP_COOKIE, groupId, {
    ...COOKIE_OPTIONS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Retient le groupe ouvert. Appelé quand on arrive sur un event d'un autre
 * groupe que le dernier ouvert : revenir à l'accueil doit rester dedans.
 *
 * Aucune vérification ici : le cookie ne fait que choisir, et readViewer
 * l'ignore s'il désigne un groupe dont on n'est pas.
 */
export async function rememberGroup(groupId: string) {
  await setGroupCookie(groupId);
}

/** Passe sur un autre groupe et revient à son accueil. */
export async function openGroup(groupId: string) {
  await setGroupCookie(groupId);
  redirect("/");
}

/**
 * Rejoindre un groupe par son lien d'invitation. La base valide le jeton,
 * le pseudo et ses chez-soi masqués, puis ouvre le groupe rejoint.
 */
export async function joinGroup(
  token: string,
  pseudo: string,
  hiddenPlaces: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_invite", {
    token,
    pseudo: pseudo.trim(),
    hidden_places: hiddenPlaces,
  });
  if (error) return { error: error.message };

  const MESSAGES: Record<string, string> = {
    anon: "Session expirée, reconnecte-toi.",
    invalid: "Ce lien n'existe pas ou a été révoqué.",
    expired: "Ce lien a passé sa date limite.",
    used: "Ce lien a servi autant de fois qu'il le pouvait.",
    pseudo_invalid: "Ton pseudo doit faire de 2 à 40 caractères.",
    pseudo_taken: "Ce pseudo est déjà pris dans ce groupe. Choisis-en un autre.",
  };
  if (data !== "ok" && data !== "already") return { error: MESSAGES[data as string] ?? "Impossible de rejoindre." };

  // Membre désormais : la politique laisse lire l'invitation, et donc son groupe.
  const { data: inv } = await supabase.from("invites").select("group_id").eq("id", token).single();
  if (inv?.group_id) await setGroupCookie(inv.group_id);
  redirect("/");
}

export type NewGroup = {
  name: string;
  emoji: string;
  tagline: string;
  pseudo: string;
  cities: City[];
  categories: string[];
};

/**
 * Créer un groupe et y entrer comme admin. La base tranche le reste —
 * cinq groupes au plus par compte, de 3 à 10 catégories — et son refus
 * remonte tel quel jusqu'au formulaire.
 */
export async function createGroup(g: NewGroup): Promise<{ error?: string }> {
  const name = g.name.trim();
  if (!name) return { error: "Donne un nom au groupe." };
  if (name.length > 40) return { error: "Quarante caractères maximum pour le nom." };

  // Seules les clés du catalogue, sans « Autre », toujours offerte en plus.
  const categories = [...new Set(g.categories)].filter((k) => CATEGORIES[k] && k !== "autre");
  if (categories.length < MIN_CATEGORIES || categories.length > MAX_CATEGORIES) {
    return { error: `Choisis de ${MIN_CATEGORIES} à ${MAX_CATEGORIES} catégories.` };
  }

  const cities = g.cities
    .map((c) => ({ name: c.name.trim(), emoji: c.emoji.trim() || "📍" }))
    .filter((c, i, all) => c.name && all.findIndex((x) => x.name.toLowerCase() === c.name.toLowerCase()) === i);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_group", {
    name,
    categories,
    pseudo: g.pseudo.trim(),
    emoji: g.emoji.trim() || null,
    tagline: g.tagline.trim() || null,
    cities,
  });
  if (error) return { error: error.message };

  await setGroupCookie(data as string);
  redirect("/");
}

/** « Couper ce groupe » : plus aucune notification venue de lui. */
export async function setGroupMuted(groupId: string, muted: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée." };

  const { error } = await supabase
    .from("members")
    .update({ muted })
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/reglages");
  return {};
}

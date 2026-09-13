"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Ville dont on veut être prévenu quand un event y est publié.
 * Stockée sur profiles.city — la politique RLS « chacun modifie sa fiche »
 * garantit qu'on n'écrit que la sienne.
 */
export async function setNotifyCity(city: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Session expirée." };

  const { error } = await supabase
    .from("profiles")
    .update({ city: city.trim() || null })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  return {};
}

/** Les trois interrupteurs de notification, sur la fiche de chacun. */
export async function setNotifyPrefs(prefs: {
  big?: boolean;
  city?: boolean;
  mine?: boolean;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Session expirée." };

  // Seules les clés fournies sont écrites : l'interface n'envoie que
  // l'interrupteur qu'on vient de basculer.
  const patch: Record<string, boolean> = {};
  if (prefs.big !== undefined) patch.notify_big = prefs.big;
  if (prefs.city !== undefined) patch.notify_city = prefs.city;
  if (prefs.mine !== undefined) patch.notify_mine = prefs.mine;
  if (Object.keys(patch).length === 0) return {};

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/");
  return {};
}

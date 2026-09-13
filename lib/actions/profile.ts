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

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Le carnet des lieux. Les politiques RLS réservent l'écriture au
 * propriétaire : ces actions ne font que relayer, et remonter le refus.
 */

export type PlaceInput = { name: string; address: string; doorCode: string; access: string; wifi: string; city: string };

const row = (p: PlaceInput) => ({
  name: p.name.trim(),
  address: p.address.trim() || null,
  door_code: p.doorCode.trim() || null,
  access: p.access.trim() || null,
  wifi: p.wifi.trim() || null,
  city: p.city.trim() || null,
});

export async function savePlace(id: string | null, place: PlaceInput) {
  if (!place.name.trim()) return { error: "Donne un nom au lieu." };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("places").update(row(place)).eq("id", id).select("id").single()
    : await supabase.from("places").insert(row(place)).select("id").single();

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/reglages");
  return { id: data.id as string };
}

export async function deletePlace(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("places").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/reglages");
  return {};
}

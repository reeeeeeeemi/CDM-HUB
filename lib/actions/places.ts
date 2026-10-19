"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Le carnet des lieux. Les politiques RLS réservent l'écriture au
 * propriétaire : ces actions ne font que relayer, et remonter le refus.
 *
 * Un lieu naît dans le groupe ouvert. Coché « chez moi », il suit son
 * propriétaire dans tous ses groupes.
 */

export type PlaceInput = { name: string; address: string; doorCode: string; access: string; wifiName: string; wifiPassword: string; city: string; isHome: boolean };

const row = (p: PlaceInput) => ({
  name: p.name.trim(),
  address: p.address.trim() || null,
  door_code: p.doorCode.trim() || null,
  access: p.access.trim() || null,
  wifi_name: p.wifiName.trim() || null,
  wifi_password: p.wifiPassword.trim() || null,
  city: p.city.trim() || null,
  is_home: p.isHome,
});

export async function savePlace(groupId: string, id: string | null, place: PlaceInput) {
  if (!place.name.trim()) return { error: "Donne un nom au lieu." };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("places").update(row(place)).eq("id", id).select("id").single()
    : await supabase.from("places").insert({ ...row(place), group_id: groupId }).select("id").single();

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

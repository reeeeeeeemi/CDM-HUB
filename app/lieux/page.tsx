import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { deletePlace, savePlace } from "@/lib/actions/places";

import { NotYet, readViewer } from "../hub";
import Places from "./places";
import "../login/login.css";
import "../reglages/reglages.css";
import "./lieux.css";

export default async function Page() {
  const viewer = await readViewer();

  if (!viewer) redirect("/login");
  if (!viewer.isMember) return <NotYet viewer={viewer} />;

  const supabase = await createClient();

  // Tout le carnet, avec qui l'a créé, et combien d'events à venir s'y
  // tiennent : on prévient avant d'en supprimer un qui sert encore.
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: placeRows }, { data: used }] = await Promise.all([
    supabase.from("places").select("id, owner_id, name, address, door_code, access, wifi, city, profiles ( pseudo )").order("name"),
    supabase.from("events").select("place_id").not("place_id", "is", null).or(`starts_on.is.null,starts_on.gte.${today}`),
  ]);

  type PlaceRow = {
    id: string; owner_id: string; name: string; address: string | null;
    door_code: string | null; access: string | null; wifi: string | null; city: string | null; profiles: { pseudo: string } | null;
  };
  const upcoming: Record<string, number> = {};
  for (const e of (used ?? []) as { place_id: string }[]) upcoming[e.place_id] = (upcoming[e.place_id] ?? 0) + 1;

  const places = ((placeRows ?? []) as unknown as PlaceRow[]).map((p) => ({
    id: p.id,
    ownerId: p.owner_id,
    owner: p.profiles?.pseudo ?? "quelqu'un",
    name: p.name,
    address: p.address ?? "",
    doorCode: p.door_code ?? "",
    access: p.access ?? "",
    wifi: p.wifi ?? "",
    city: p.city ?? "",
    upcoming: upcoming[p.id] ?? 0,
  }));

  return <Places viewer={viewer} places={places} onSave={savePlace} onDelete={deletePlace} />;
}

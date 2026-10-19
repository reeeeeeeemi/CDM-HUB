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
  if (!viewer.isMember || !viewer.group) return <NotYet viewer={viewer} />;

  const group = viewer.group;
  const supabase = await createClient();

  // Le carnet du groupe — ses lieux, et le chez-soi de chacun —, les pseudos
  // d'ici pour dire chez qui, et combien d'events à venir s'y tiennent : on
  // prévient avant d'en supprimer un qui sert encore.
  // Le jour à Paris : le serveur tourne en UTC, où l'on est encore la veille
  // entre minuit et deux heures.
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const [{ data: placeRows }, { data: names }, { data: gone }, { data: used }] = await Promise.all([
    supabase.rpc("group_places", { g: group.id })
      .select("id, owner_id, name, address, door_code, access, wifi_name, wifi_password, city, is_home").order("name"),
    supabase.from("members").select("user_id, pseudo").eq("group_id", group.id),
    supabase.from("departed").select("user_id, pseudo").eq("group_id", group.id),
    supabase.from("events").select("place_id").eq("group_id", group.id).not("place_id", "is", null).or(`starts_on.is.null,starts_on.gte.${today}`),
  ]);

  type PlaceRow = {
    id: string; owner_id: string; name: string; address: string | null;
    door_code: string | null; access: string | null; wifi_name: string | null; wifi_password: string | null; city: string | null; is_home: boolean;
  };
  const upcoming: Record<string, number> = {};
  for (const e of (used ?? []) as { place_id: string }[]) upcoming[e.place_id] = (upcoming[e.place_id] ?? 0) + 1;
  const pseudo: Record<string, string> = {};
  for (const n of [...(gone ?? []), ...(names ?? [])] as { user_id: string; pseudo: string }[]) pseudo[n.user_id] = n.pseudo;

  const places = ((placeRows ?? []) as unknown as PlaceRow[]).map((p) => ({
    id: p.id,
    ownerId: p.owner_id,
    owner: pseudo[p.owner_id] ?? "quelqu'un",
    name: p.name,
    address: p.address ?? "",
    doorCode: p.door_code ?? "",
    access: p.access ?? "",
    wifiName: p.wifi_name ?? "",
    wifiPassword: p.wifi_password ?? "",
    city: p.city ?? "",
    isHome: p.is_home,
    upcoming: upcoming[p.id] ?? 0,
  }));

  return (
    <Places viewer={viewer} cities={group.cities} places={places}
      onSave={savePlace.bind(null, group.id)} onDelete={deletePlace} />
  );
}

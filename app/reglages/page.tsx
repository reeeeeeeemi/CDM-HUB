import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createInvite } from "@/lib/actions/invite";
import { setBirthday, setNotifyCities, setNotifyPrefs, setPseudo } from "@/lib/actions/profile";
import { deletePlace, savePlace } from "@/lib/actions/places";

import { NotYet, readViewer } from "../hub";
import Settings from "./settings";
import "../login/login.css";
import "./reglages.css";

export default async function Page() {
  const viewer = await readViewer();

  if (!viewer) redirect("/login");
  if (!viewer.isMember) return <NotYet viewer={viewer} />;

  const supabase = await createClient();

  // Les politiques ne renvoient members et profiles qu'aux membres du groupe :
  // la liste ne fuite pas, et il n'y a rien à filtrer ici.
  const { data: rows } = await supabase
    .from("members")
    .select("user_id, added_at, profiles ( pseudo, city )")
    .order("added_at");

  type Row = { user_id: string; profiles: { pseudo: string; city: string | null } | null };

  const members = ((rows ?? []) as unknown as Row[]).map((r) => ({
    id: r.user_id,
    pseudo: r.profiles?.pseudo ?? "quelqu'un",
    city: r.profiles?.city ?? "",
  }));

  const { data: profile } = await supabase
    .from("profiles")
    .select("notify_cities, notify_joined, notify_nudge, notify_birthday, notify_digest, birthday")
    .eq("id", viewer.id)
    .single();

  // Tout le carnet, avec qui l'a créé, et combien d'events à venir s'y
  // tiennent : on prévient avant d'en supprimer un qui sert encore.
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: placeRows }, { data: used }] = await Promise.all([
    supabase.from("places").select("id, owner_id, name, address, door_code, access, profiles ( pseudo )").order("name"),
    supabase.from("events").select("place_id").not("place_id", "is", null).or(`starts_on.is.null,starts_on.gte.${today}`),
  ]);

  type PlaceRow = {
    id: string; owner_id: string; name: string; address: string | null;
    door_code: string | null; access: string | null; profiles: { pseudo: string } | null;
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
    upcoming: upcoming[p.id] ?? 0,
  }));

  return (
    <Settings
      viewer={viewer}
      members={members}
      cities={profile?.notify_cities ?? []}
      prefs={{
        ...viewer.prefs,
        joined: profile?.notify_joined ?? true,
        nudge: profile?.notify_nudge ?? true,
        birthday: profile?.notify_birthday ?? true,
        digest: profile?.notify_digest ?? true,
      }}
      onSetCities={setNotifyCities}
      onSetPrefs={setNotifyPrefs}
      onSetPseudo={setPseudo}
      birthday={profile?.birthday ?? ""}
      onSetBirthday={setBirthday}
      places={places}
      onSavePlace={savePlace}
      onDeletePlace={deletePlace}
      onInvite={createInvite}
    />
  );
}

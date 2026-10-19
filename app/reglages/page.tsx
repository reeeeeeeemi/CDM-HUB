import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createInvite } from "@/lib/actions/invite";
import { setGroupMuted } from "@/lib/actions/group";
import { setBirthday, setNotifyCities, setNotifyPrefs, setPseudo } from "@/lib/actions/profile";

import { NotYet, readViewer } from "../hub";
import Settings from "./settings";
import "../login/login.css";
import "./reglages.css";

export default async function Page() {
  const viewer = await readViewer();

  if (!viewer) redirect("/login");
  if (!viewer.isMember || !viewer.group) return <NotYet viewer={viewer} />;

  const group = viewer.group;
  const supabase = await createClient();

  // Les membres du groupe ouvert, avec leur pseudo d'ici.
  const { data: rows } = await supabase
    .from("members")
    .select("user_id, pseudo, added_at, profiles ( city )")
    .eq("group_id", group.id)
    .order("added_at");

  type Row = { user_id: string; pseudo: string; profiles: { city: string | null } | null };

  const members = ((rows ?? []) as unknown as Row[]).map((r) => ({
    id: r.user_id,
    pseudo: r.pseudo,
    city: r.profiles?.city ?? "",
  }));

  const { data: profile } = await supabase
    .from("profiles")
    .select("notify_cities, notify_joined, notify_nudge, notify_birthday, notify_digest, birthday")
    .eq("id", viewer.id)
    .single();

  return (
    <Settings
      viewer={viewer}
      group={{ name: group.name, cities: group.cities }}
      isAdmin={viewer.role === "admin"}
      muted={viewer.muted}
      onSetMuted={setGroupMuted.bind(null, group.id)}
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
      onSetPseudo={setPseudo.bind(null, group.id)}
      birthday={profile?.birthday ?? ""}
      onSetBirthday={setBirthday}
      onInvite={createInvite.bind(null, group.id)}
    />
  );
}

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createInvite } from "@/lib/actions/invite";
import { setNotifyCities, setNotifyPrefs, setPseudo } from "@/lib/actions/profile";

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
    .select("notify_cities, notify_joined, notify_digest")
    .eq("id", viewer.id)
    .single();

  return (
    <Settings
      viewer={viewer}
      members={members}
      cities={profile?.notify_cities ?? []}
      prefs={{
        ...viewer.prefs,
        joined: profile?.notify_joined ?? true,
        digest: profile?.notify_digest ?? true,
      }}
      onSetCities={setNotifyCities}
      onSetPrefs={setNotifyPrefs}
      onSetPseudo={setPseudo}
      onInvite={createInvite}
    />
  );
}

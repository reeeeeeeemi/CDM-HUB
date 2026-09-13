import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import CrewHub from "./crew-hub";
import { setNotifyCity } from "@/lib/actions/profile";

import { signOut } from "./login/actions";
import "./login/login.css";

export default async function Page() {
  const supabase = await createClient();

  // getUser valide le jeton auprès de Supabase. getSession se contenterait de
  // lire le cookie, qui est falsifiable — ne jamais s'en servir pour décider
  // d'un accès côté serveur.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("pseudo, city")
    .eq("id", user.id)
    .single();

  // Le RLS ne renvoie cette table qu'aux membres : zéro ligne signifie que le
  // compte existe mais n'a pas encore été invité dans le groupe.
  const { data: membership } = await supabase
    .from("members")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return (
      <div className="auth">
        <div className="auth-badge" aria-hidden="true">🔒</div>
        <p className="auth-kicker">CDM</p>
        <h1 className="auth-title">Presque !</h1>
        <p className="auth-sub">
          Ton compte est créé, {profile?.pseudo ?? user.email}. Il faut maintenant qu&apos;on
          t&apos;ajoute au groupe pour que tu voies les plans.
        </p>
        <p className="auth-msg ok">Demande à Rémi de t&apos;ajouter, puis recharge cette page.</p>
        <form action={signOut}>
          <button className="auth-submit" type="submit" style={{ marginTop: 20 }}>
            Se déconnecter
          </button>
        </form>
        <p className="auth-note">
          Connecté avec {user.email}. Ce n&apos;est pas toi ? Déconnecte-toi et reprends avec le bon
          compte.
        </p>
      </div>
    );
  }

  return (
    <CrewHub
      me={profile?.pseudo ?? "moi"}
      onSignOut={signOut}
      notifyCity={profile?.city ?? ""}
      onSetCity={setNotifyCity}
    />
  );
}

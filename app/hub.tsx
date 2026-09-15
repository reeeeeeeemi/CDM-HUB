import { createClient } from "@/lib/supabase/server";

import CrewHub from "./crew-hub";
import { GROUP } from "@/lib/brand";
import { signOut } from "./login/actions";

export type Viewer = {
  id: string;
  email: string;
  pseudo: string;
  city: string;
  prefs: { big: boolean; city: boolean; mine: boolean };
  isMember: boolean;
};

/**
 * Qui regarde, et a-t-il le droit d'entrer.
 *
 * Partagé entre l'accueil et la fiche d'un event, qui gardent chacun leur
 * façon d'éconduire un visiteur — « Presque ! » pour qui arrive par la porte,
 * « demande une invitation » pour qui suit un lien transféré.
 */
export async function readViewer(): Promise<Viewer | null> {
  const supabase = await createClient();

  // getUser valide le jeton auprès de Supabase. getSession se contenterait de
  // lire le cookie, qui est falsifiable — ne jamais s'en servir pour décider
  // d'un accès côté serveur.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("pseudo, city, notify_big, notify_city, notify_mine")
    .eq("id", user.id)
    .single();

  // Le RLS ne renvoie cette table qu'aux membres : zéro ligne signifie que le
  // compte existe mais n'a pas encore été invité dans le groupe.
  const { data: membership } = await supabase
    .from("members")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    pseudo: profile?.pseudo ?? "moi",
    city: profile?.city ?? "",
    prefs: {
      big: profile?.notify_big ?? true,
      city: profile?.notify_city ?? true,
      mine: profile?.notify_mine ?? true,
    },
    isMember: Boolean(membership),
  };
}

/**
 * L'app elle-même. `initialEvent` ouvre directement une fiche : c'est ce qui
 * arrive quand on suit un lien partagé ou qu'on touche une notification.
 */
export function Hub({ viewer, initialEvent }: { viewer: Viewer; initialEvent?: string }) {
  // `me` est l'identifiant : c'est lui qui sert aux comparaisons et qui part
  // en base. Le pseudo ne sert qu'à l'affichage.
  return (
    <CrewHub
      me={viewer.id}
      meName={viewer.pseudo}
      onSignOut={signOut}
      notifyCity={viewer.city}
      initialEvent={initialEvent}
    />
  );
}

/** Compte créé, groupe pas encore rejoint. */
export function NotYet({ viewer }: { viewer: Viewer }) {
  return (
    <div className="auth">
      <div className="auth-badge" aria-hidden="true">🔒</div>
      <p className="auth-kicker">{GROUP}</p>
      <h1 className="auth-title">Presque !</h1>
      <p className="auth-sub">
        Ton compte est créé, {viewer.pseudo}. Il faut maintenant qu&apos;on t&apos;ajoute au
        groupe pour que tu voies les plans.
      </p>
      <p className="auth-msg ok">Demande ton lien d&apos;invitation, puis recharge cette page.</p>
      <form action={signOut}>
        <button className="auth-submit" type="submit" style={{ marginTop: 20 }}>
          Se déconnecter
        </button>
      </form>
      <p className="auth-note">
        Connecté avec {viewer.email}. Ce n&apos;est pas toi ? Déconnecte-toi et reprends avec le
        bon compte.
      </p>
    </div>
  );
}

import Link from "next/link";
import { cookies } from "next/headers";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import CrewHub from "./crew-hub";
import { setNotifyCity } from "@/lib/actions/profile";
import { APP_NAME } from "@/lib/brand";
import { GROUP_COOKIE, toGroup, type Group, type GroupChip, type Role } from "@/lib/group";
import { signOut } from "./login/actions";

export type Viewer = {
  id: string;
  email: string;
  /** Son pseudo dans le groupe ouvert, celui de l'inscription sinon. */
  pseudo: string;
  city: string;
  prefs: { big: boolean; city: boolean; mine: boolean };
  isMember: boolean;
  /** Le groupe ouvert. Nul tant qu'on n'est d'aucun groupe. */
  group: Group | null;
  role: Role;
  muted: boolean;
  /** Tous ses groupes, pour passer de l'un à l'autre. */
  groups: GroupChip[];
  /** Le groupe ouvert diffère du dernier retenu : il faut le retenir. */
  remember: boolean;
};

type MemberRow = {
  pseudo: string;
  role: Role;
  muted: boolean;
  groups: Record<string, unknown> | null;
};

/**
 * Qui regarde, de quels groupes il est, et lequel est ouvert.
 *
 * `prefer` force un groupe — celui d'un event qu'on ouvre par un lien. À
 * défaut, le dernier ouvert, puis le premier rejoint. Un groupe dont on
 * n'est pas n'est jamais retenu : la liste vient de la base, pas du cookie.
 *
 * Partagé entre l'accueil et la fiche d'un event, qui gardent chacun leur
 * façon d'éconduire un visiteur — « Presque ! » pour qui arrive par la porte,
 * « demande une invitation » pour qui suit un lien transféré.
 */
export async function readViewer(prefer?: string): Promise<Viewer | null> {
  const supabase = await createClient();

  // getUser valide le jeton auprès de Supabase. getSession se contenterait de
  // lire le cookie, qui est falsifiable — ne jamais s'en servir pour décider
  // d'un accès côté serveur.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  // Supabase injoignable n'est pas « déconnecté » : renvoyer null mènerait
  // à /login, donc à retaper un mot de passe valide. On laisse app/error.tsx
  // proposer de réessayer.
  if (isAuthRetryableFetchError(error)) throw error;
  if (!user) return null;

  // En parallèle : les deux lectures ne dépendent que de l'identifiant, et
  // chaque aller-retour vers la base se paie à chaque ouverture de page.
  const [{ data: profile }, { data: rows }, jar] = await Promise.all([
    supabase
      .from("profiles")
      .select("pseudo, city, notify_big, notify_city, notify_mine")
      .eq("id", user.id)
      .single(),
    supabase
      .from("members")
      .select("pseudo, role, muted, groups ( id, name, emoji, tagline, cities, categories )")
      .eq("user_id", user.id)
      .order("added_at"),
    cookies(),
  ]);

  const memberships = ((rows ?? []) as unknown as MemberRow[])
    .filter((r) => r.groups)
    .map((r) => ({ pseudo: r.pseudo, role: r.role, muted: r.muted, group: toGroup(r.groups!) }));

  const remembered = jar.get(GROUP_COOKIE)?.value;
  const current =
    memberships.find((m) => m.group.id === prefer) ??
    memberships.find((m) => m.group.id === remembered) ??
    memberships[0] ??
    null;

  return {
    id: user.id,
    email: user.email ?? "",
    pseudo: current?.pseudo ?? profile?.pseudo ?? "moi",
    city: profile?.city ?? "",
    prefs: {
      big: profile?.notify_big ?? true,
      city: profile?.notify_city ?? true,
      mine: profile?.notify_mine ?? true,
    },
    isMember: Boolean(current),
    group: current?.group ?? null,
    role: current?.role ?? "member",
    muted: current?.muted ?? false,
    groups: memberships.map((m) => ({ id: m.group.id, name: m.group.name, emoji: m.group.emoji })),
    remember: Boolean(current && current.group.id !== remembered),
  };
}

/**
 * L'app elle-même. `initialEvent` ouvre directement une fiche : c'est ce qui
 * arrive quand on suit un lien partagé ou qu'on touche une notification.
 */
export function Hub({ viewer, initialEvent, openChat = false }: { viewer: Viewer; initialEvent?: string; openChat?: boolean }) {
  // `me` est l'identifiant : c'est lui qui sert aux comparaisons et qui part
  // en base. Le pseudo ne sert qu'à l'affichage.
  return (
    <CrewHub
      me={viewer.id}
      meName={viewer.pseudo}
      onSignOut={signOut}
      notifyCity={viewer.city}
      onSetCity={setNotifyCity}
      initialEvent={initialEvent}
      openChat={openChat}
      group={viewer.group!}
      groups={viewer.groups}
      remember={viewer.remember}
    />
  );
}

/** Compte créé, aucun groupe rejoint. */
export function NotYet({ viewer }: { viewer: Viewer }) {
  return (
    <div className="auth">
      <div className="auth-badge" aria-hidden="true">🔒</div>
      <p className="auth-kicker">{APP_NAME}</p>
      <h1 className="auth-title">Presque !</h1>
      <p className="auth-sub">
        Ton compte est créé, {viewer.pseudo}. Il ne te manque plus qu&apos;un groupe pour voir les
        plans.
      </p>
      <p className="auth-msg ok">Demande un lien d&apos;invitation à un membre, puis ouvre-le.</p>
      <Link className="auth-submit" href="/groupes/nouveau" style={{ marginTop: 20 }}>
        Ou crée ton propre groupe
      </Link>
      <form action={signOut}>
        <button className="auth-submit" type="submit" style={{ marginTop: 12 }}>
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

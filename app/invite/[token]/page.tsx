import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/brand";
import { groupBadge } from "@/lib/group";

import JoinForm from "./join";
import "../../login/login.css";

const MESSAGES: Record<string, { title: string; text: string }> = {
  invalid: {
    title: "Lien invalide",
    text: "Ce lien n'existe pas ou a été révoqué. Demande-en un nouveau à la personne qui t'a invité.",
  },
  expired: {
    title: "Lien expiré",
    text: "Ce lien a passé sa date limite. Demande-en un nouveau, ça prend dix secondes.",
  },
  used: {
    title: "Lien épuisé",
    text: "Ce lien a servi autant de fois qu'il le pouvait. Demande-en un nouveau.",
  },
};

type Preview = { group_name: string | null; group_emoji: string | null; status: string; pseudo: string | null };

/**
 * Un lien d'invitation. On dit d'abord dans quel groupe il fait entrer,
 * compte ou pas : invite_preview ne livre que ce nom. Ensuite, connecté, on
 * choisit son pseudo dans ce groupe et ce qu'on y montre de chez soi.
 */
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();

  const [{ data: { user } }, { data }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("invite_preview", { token }),
  ]);
  const p = ((data ?? [])[0] ?? { status: "invalid" }) as Preview;
  const badge = p.group_name ? groupBadge({ name: p.group_name, emoji: p.group_emoji }) : "🔗";

  const m = MESSAGES[p.status];
  if (m) {
    return (
      <div className="auth">
        <div className="auth-badge" aria-hidden="true">🔗</div>
        <p className="auth-kicker">{p.group_name ?? APP_NAME}</p>
        <h1 className="auth-title">{m.title}</h1>
        <p className="auth-sub">{m.text}</p>
        <Link className="auth-submit" href="/">Retour au hub</Link>
        {user && <p className="auth-note">Connecté avec {user.email}.</p>}
      </div>
    );
  }

  // Pas encore de compte : on le dit, puis on l'envoie s'inscrire, et on
  // revient ici après.
  if (!user) {
    return (
      <div className="auth">
        <div className="auth-badge" aria-hidden="true">{badge}</div>
        <p className="auth-kicker">{APP_NAME}</p>
        <h1 className="auth-title">Tu es invité dans {p.group_name}</h1>
        <p className="auth-sub">
          Crée ton compte ou connecte-toi : tu arriveras directement dans le groupe.
        </p>
        <Link className="auth-submit" href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}>
          Continuer
        </Link>
      </div>
    );
  }

  // Ses chez-soi : il choisit lesquels ce groupe verra.
  const { data: homes } = await supabase
    .from("places")
    .select("id, name")
    .eq("owner_id", user.id)
    .eq("is_home", true)
    .order("name");

  return (
    <div className="auth">
      <div className="auth-badge" aria-hidden="true">{badge}</div>
      <p className="auth-kicker">{APP_NAME}</p>
      <h1 className="auth-title">
        {p.status === "already" ? `Tu es déjà dans ${p.group_name}` : `Tu es invité dans ${p.group_name}`}
      </h1>
      <JoinForm
        token={token}
        group={p.group_name ?? ""}
        already={p.status === "already"}
        pseudo={p.pseudo ?? ""}
        homes={(homes ?? []) as { id: string; name: string }[]}
      />
      <p className="auth-note">Connecté avec {user.email}.</p>
    </div>
  );
}

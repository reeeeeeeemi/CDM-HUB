import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Pas encore de compte : on l'envoie s'inscrire, et on revient ici après.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const { data, error } = await supabase.rpc("redeem_invite", { token });
  const result = error ? "invalid" : (data as string);

  if (result === "ok" || result === "already") {
    redirect("/");
  }

  const m = MESSAGES[result] ?? MESSAGES.invalid;

  return (
    <div className="auth">
      <div className="auth-badge" aria-hidden="true">🔗</div>
      <p className="auth-kicker">CDM</p>
      <h1 className="auth-title">{m.title}</h1>
      <p className="auth-sub">{m.text}</p>
      <Link className="auth-submit" href="/">Retour au hub</Link>
      <p className="auth-note">Connecté avec {user.email}.</p>
    </div>
  );
}

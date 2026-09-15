import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { APP_NAME, GROUP } from "@/lib/brand";

import { Hub, readViewer } from "../../hub";
import "../../login/login.css";

type Preview = { title: string; starts_on: string | null; ends_on: string | null };

/**
 * Titre et dates, lisibles sans compte.
 *
 * Passe par event_preview, une fonction security definer volontairement
 * étroite : WhatsApp charge le lien depuis ses serveurs, sans cookie, et les
 * politiques RLS lui renverraient sinon une page vide.
 */
async function preview(id: string): Promise<Preview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_preview", { event_id: id });
  if (error || !data || data.length === 0) return null;
  return data[0] as Preview;
}

const MOIS = ["janv", "févr", "mars", "avril", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

function frDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MOIS[m - 1]} ${y}`;
}

function whenLabel(p: Preview) {
  if (!p.starts_on) return "Date à voter";
  if (p.ends_on && p.ends_on !== p.starts_on) return `Du ${frDate(p.starts_on)} au ${frDate(p.ends_on)}`;
  return frDate(p.starts_on);
}

export async function generateMetadata({ params }: PageProps<"/event/[id]">) {
  const { id } = await params;
  const p = await preview(id);
  if (!p) return { title: APP_NAME };

  const description = whenLabel(p);
  return {
    title: `${p.title} · ${APP_NAME}`,
    description,
    // Ce que voient WhatsApp et Messenger dans leur aperçu.
    openGraph: { title: p.title, description, type: "website" },
  };
}

export default async function EventPage({ params }: PageProps<"/event/[id]">) {
  const { id } = await params;
  const viewer = await readViewer();

  if (viewer?.isMember) return <Hub viewer={viewer} initialEvent={id} />;

  // Lien transféré hors du groupe : on montre ce que l'aperçu montrait déjà,
  // et rien de plus. Pas l'écran de connexion brut — il ne dirait pas
  // pourquoi ça ne marche pas.
  const p = await preview(id);

  return (
    <div className="auth">
      <div className="auth-badge" aria-hidden="true">🔒</div>
      <p className="auth-kicker">{GROUP}</p>
      <h1 className="auth-title">{p ? p.title : "Plan privé"}</h1>
      <p className="auth-sub">
        {p ? `${whenLabel(p)}. ` : ""}
        Ce plan appartient à un groupe privé. Il faut un lien d&apos;invitation pour y entrer —
        demande-le à qui t&apos;a envoyé ce message.
      </p>
      {viewer ? (
        <p className="auth-msg ok">
          Tu es connecté avec {viewer.email}, mais ce compte ne fait pas encore partie du groupe.
        </p>
      ) : (
        <Link className="auth-submit" href={`/login?next=${encodeURIComponent(`/event/${id}`)}`}>
          J&apos;ai déjà un compte
        </Link>
      )}
    </div>
  );
}

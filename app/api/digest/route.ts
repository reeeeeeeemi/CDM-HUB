import { createClient } from "@/lib/supabase/server";
import { sendPush, type PushTarget } from "@/lib/push-send";

// Envoi de notifications : jamais mis en cache, et exécuté à chaque appel.
export const dynamic = "force-dynamic";

type Row = PushTarget & { event_id: string; title: string; joined: number };

/**
 * Le récapitulatif du matin : qui s'est ajouté depuis hier sur les plans où
 * tu t'es dit chaud.
 *
 * Remplace une notification par personne qui rejoint — dans un groupe de
 * quinze, un seul event pouvait en produire quatorze.
 *
 * Appelée par la tâche planifiée de Vercel (voir vercel.json). Deux secrets
 * distincts, pour deux questions distinctes : CRON_SECRET atteste que
 * l'appel vient bien de Vercel, DIGEST_SECRET autorise la fonction SQL à
 * lire des données qu'aucune session n'accompagne.
 */
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected && request.headers.get("authorization") !== `Bearer ${expected}`) {
    return new Response("Non autorisé", { status: 401 });
  }

  const secret = process.env.DIGEST_SECRET;
  if (!secret) return Response.json({ error: "DIGEST_SECRET manquant" }, { status: 500 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("digest_pending", { secret });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Row[];

  // Une notification par appareil, pas une par event : c'est tout l'objet du
  // récapitulatif. Les events sont listés dans le corps du message.
  const byDevice = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byDevice.get(r.endpoint);
    if (list) list.push(r);
    else byDevice.set(r.endpoint, [r]);
  }

  let sent = 0;
  for (const list of byDevice.values()) {
    const total = list.reduce((n, r) => n + r.joined, 0);
    const first = list[0];
    const body =
      list.length === 1
        ? first.title
        : list.map((r) => `${r.title} (+${r.joined})`).join(" · ");

    const res = await sendPush([first], {
      title: `${total} ${total > 1 ? "personnes se sont ajoutées" : "personne s'est ajoutée"}`,
      body,
      // Un seul event : on ouvre dessus. Plusieurs : on ouvre la liste.
      url: list.length === 1 ? `/event/${first.event_id}` : "/",
      tag: "digest",
    });
    sent += res.sent;
  }

  return Response.json({ devices: byDevice.size, sent });
}

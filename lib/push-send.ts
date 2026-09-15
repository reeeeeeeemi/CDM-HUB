import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

import { createClient } from "@/lib/supabase/server";

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag: string };

let configured = false;

/**
 * Configure web-push à la première utilisation seulement.
 *
 * Renvoie false quand les clés manquent — sur une preview où les variables
 * n'ont pas été renseignées, par exemple. Mieux vaut ne rien notifier que
 * faire échouer l'action qui a déclenché l'envoi.
 */
function ready() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hub@cdm.local",
    publicKey,
    privateKey
  );
  configured = true;
  return true;
}

/**
 * Envoie à tout le monde en parallèle, et oublie les appareils que le service
 * de push déclare morts : 404 et 410 signifient que l'abonnement n'existe
 * plus — app désinstallée, navigateur réinitialisé. Sans ce ménage ils
 * resteraient en base à faire échouer chaque envoi.
 *
 * Ce module n'est volontairement pas un fichier "use server" : exporter cette
 * fonction depuis un tel fichier en ferait un point d'entrée appelable depuis
 * n'importe quel navigateur, capable d'envoyer ce qu'il veut à qui il veut.
 */
export async function sendPush(targets: PushTarget[], payload: PushPayload) {
  if (targets.length === 0 || !ready()) return { sent: 0 };

  const supabase = await createClient();
  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    targets.map(async (t) => {
      const sub: WebPushSubscription = {
        endpoint: t.endpoint,
        keys: { p256dh: t.p256dh, auth: t.auth },
      };
      try {
        await webpush.sendNotification(sub, body);
        return true;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.rpc("prune_push_subscription", { dead_endpoint: t.endpoint });
        }
        throw e;
      }
    })
  );

  return { sent: results.filter((r) => r.status === "fulfilled").length };
}

"use server";

import webpush, { type PushSubscription as WebPushSubscription } from "web-push";

import { createClient } from "@/lib/supabase/server";

/** Ce que le navigateur renvoie après un `pushManager.subscribe()`. */
export type BrowserSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type Target = { endpoint: string; p256dh: string; auth: string };

let configured = false;

/**
 * Configure web-push à la première utilisation seulement.
 *
 * Renvoie false quand les clés manquent — sur une preview où les variables
 * n'ont pas été renseignées, par exemple. Mieux vaut ne rien notifier que
 * faire échouer la création de l'event.
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

/** Enregistre l'appareil courant. Un même compte peut en avoir plusieurs. */
export async function savePushSubscription(sub: BrowserSubscription) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Session expirée." };

  // upsert : réactiver les notifications sur un appareil déjà connu ne doit
  // pas échouer sur la clé primaire.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      user_id: user.id,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" }
  );

  return error ? { error: error.message } : {};
}

/** Retire l'appareil courant. La politique RLS limite au propriétaire. */
export async function removePushSubscription(endpoint: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  return error ? { error: error.message } : {};
}

type Payload = { title: string; body: string; url: string; tag: string };

/**
 * Envoie à tout le monde en parallèle, et oublie les appareils que le service
 * de push déclare morts : 404 et 410 signifient que l'abonnement n'existe
 * plus — app désinstallée, navigateur réinitialisé. Sans ce ménage ils
 * resteraient en base à faire échouer chaque envoi.
 */
async function deliver(targets: Target[], payload: Payload) {
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

/**
 * Notifie la publication d'un event.
 *
 * Qui reçoit quoi est décidé en base (push_targets_for_event) : big event
 * pour tout le groupe, event du quotidien pour ceux qui vivent dans la ville.
 */
export async function notifyNewEvent(eventId: string, title: string, scale: string, city: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("push_targets_for_event", { event_id: eventId });
  if (error || !data) return { sent: 0 };

  const big = scale === "big";
  return deliver(data as Target[], {
    title: big ? "✨ Nouveau big event" : `Nouveau plan${city ? ` à ${city}` : ""}`,
    body: title,
    url: "/",
    tag: `event:${eventId}`,
  });
}

/** Notifie l'auteur d'un event qu'on a réagi dessus. */
export async function notifyEventActivity(eventId: string, title: string, what: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("push_targets_for_author", { event_id: eventId });
  if (error || !data) return { sent: 0 };

  return deliver(data as Target[], {
    title,
    body: what,
    url: "/",
    tag: `event:${eventId}`,
  });
}

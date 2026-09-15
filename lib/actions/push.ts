"use server";

import { createClient } from "@/lib/supabase/server";
import { sendPush, type PushTarget } from "@/lib/push-send";

/** Ce que le navigateur renvoie après un `pushManager.subscribe()`. */
export type BrowserSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

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

/**
 * Notifie la publication d'un event.
 *
 * Qui reçoit quoi est décidé en base (push_targets_for_event) : big event
 * pour tout le groupe, event du quotidien pour ceux qui vivent dans la ville.
 */
export async function notifyNewEvent(
  eventId: string,
  title: string,
  scale: string,
  city: string,
  when: string
) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("push_targets_for_event", { event_id: eventId });
  if (error || !data) return { sent: 0 };

  // Le titre de l'event en première ligne : c'est lui qu'on lit sur un écran
  // verrouillé, pas la catégorie. Le contexte passe en dessous.
  const kind = scale === "big" ? "✨ Nouveau big event" : "Nouveau plan";
  const parts = [kind, city, when].filter(Boolean);
  return sendPush(data as PushTarget[], {
    title,
    body: parts.join(" · "),
    url: `/event/${eventId}`,
    tag: `event:${eventId}`,
  });
}

/**
 * Notifie les gens chauds qu'un plan a bougé.
 *
 * Faute d'écran d'édition, une date ou un lieu ne changent qu'en figeant un
 * sondage : « le sondage se clôt » et « la date change » sont le même
 * instant, et cette fonction couvre les deux — plus l'annulation.
 */
export async function notifyAttendees(eventId: string, title: string, what: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("push_targets_for_attendees", { event_id: eventId });
  if (error || !data) return { sent: 0 };

  return sendPush(data as PushTarget[], {
    title,
    body: what,
    url: `/event/${eventId}`,
    tag: `event:${eventId}`,
  });
}

/** Notifie l'auteur d'un event qu'on a réagi dessus. */
export async function notifyEventActivity(eventId: string, title: string, what: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("push_targets_for_author", { event_id: eventId });
  if (error || !data) return { sent: 0 };

  return sendPush(data as PushTarget[], {
    title,
    body: what,
    url: `/event/${eventId}`,
    tag: `event:${eventId}`,
  });
}

"use client";

import { useEffect, useState } from "react";

import { savePushSubscription, removePushSubscription } from "@/lib/actions/push";

// Les règles, telles qu'elles apparaissent dans les réglages. Les clés
// correspondent aux colonnes notify_* de profiles.
export const PREFS = [
  ["big",    "Les big events", "Voyages, ski, week-ends — où qu'ils aient lieu."],
  ["city",   "Les plans dans mes villes", "Restos, soirées, coinche, dans les villes cochées plus haut."],
  ["mine",   "Les réactions sur mes events", "Quand quelqu'un est chaud ou commente un plan que tu as créé."],
  ["joined", "Les plans où je suis chaud", "Quand une date ou un lieu est fixé, ou que l'event est annulé."],
  ["digest", "Le récap du matin", "Une fois par jour : qui s'est ajouté sur tes plans depuis la veille."],
];

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** La clé VAPID voyage en base64url ; PushManager attend des octets bruts. */
const vapidBytes = (key) => {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

/**
 * État de l'abonnement aux notifications de cet appareil.
 *
 * « unsupported » n'est pas un échec : sur iPhone, Notification et PushManager
 * n'existent que dans l'app ajoutée à l'écran d'accueil. Dans Safari, il n'y a
 * rien à proposer, et le dire vaut mieux qu'un bouton qui ne ferait rien.
 */
export function usePush() {
  const [state, setState] = useState("checking"); // checking|unsupported|off|on|denied
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      if (!VAPID || !("serviceWorker" in navigator) || !("PushManager" in window)
          || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        setState((await reg.pushManager.getSubscription()) ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  const enable = async () => {
    setBusy(true); setErr("");
    try {
      // iOS exige que la demande vienne d'un geste : d'où le bouton.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidBytes(VAPID),
      });
      const r = await savePushSubscription(JSON.parse(JSON.stringify(sub)));
      // Si la base refuse, défaire l'abonnement : le garder côté navigateur
      // promettrait des notifications que personne ne saurait envoyer.
      if (r?.error) { await sub.unsubscribe(); setErr(r.error); return; }
      setState("on");
    } catch (e) {
      setErr(e?.message || "Impossible d'activer les notifications.");
    } finally { setBusy(false); }
  };

  const disable = async () => {
    setBusy(true); setErr("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
      setState("off");
    } catch (e) {
      setErr(e?.message || "Impossible de couper les notifications.");
    } finally { setBusy(false); }
  };

  return { state, busy, err, enable, disable };
}


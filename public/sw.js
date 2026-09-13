/*
 * Service worker du HUB CDM — il n'existe que pour les notifications.
 *
 * Volontairement aucun cache : l'app se recharge au retour au premier plan,
 * et un cache mal purgé servirait une version périmée à des gens qui ne
 * sauraient pas comment la rafraîchir.
 */

// Prend la main sans attendre la fermeture des onglets ouverts, sinon une
// version corrigée du worker peut rester en attente pendant des jours.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { body: event.data ? event.data.text() : "" };
  }

  event.waitUntil(
    self.registration.showNotification(d.title || "HUB Events CDM", {
      body: d.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      // Même tag = les notifications d'un même event se remplacent au lieu
      // de s'empiler quand plusieurs personnes réagissent coup sur coup.
      tag: d.tag || undefined,
      data: { url: d.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Réutiliser la fenêtre déjà ouverte : en ouvrir une seconde laisserait
      // deux copies de l'app côte à côte.
      for (const c of open) {
        if ("focus" in c) {
          await c.focus();
          if ("navigate" in c) await c.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});

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
  const target = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Une fenêtre de l'app est déjà ouverte : s'y rendre plutôt que d'en
      // ouvrir une seconde à côté.
      for (const c of list) {
        if (c.url && new URL(c.url).origin === self.location.origin && "focus" in c) {
          if ("navigate" in c) c.navigate(target).catch(() => {});
          return c.focus();
        }
      }
      // Sinon ouvrir l'app. openWindow doit être atteint sans attente
      // superflue : iOS bascule sur le navigateur si on tarde trop.
      return self.clients.openWindow(target);
    })
  );
});

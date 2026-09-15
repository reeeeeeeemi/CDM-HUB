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

  const mine = (c) => {
    try {
      return c.url && new URL(c.url).origin === self.location.origin;
    } catch {
      return false;
    }
  };

  event.waitUntil(
    (async () => {
      /*
       * Sur iOS, toucher la notification lance déjà l'app installée : sa
       * fenêtre met simplement un instant à exister. Appeler openWindow tout
       * de suite revenait à demander une seconde ouverture, que le système
       * confiait au navigateur — lequel a son propre espace de session, d'où
       * l'écran de connexion alors qu'on était déjà connecté.
       *
       * On laisse donc sa chance à la fenêtre d'apparaître avant de conclure
       * que personne ne l'a ouverte. Les paliers sont courts : sur Android,
       * où rien ne se lance tout seul, ils ne coûtent qu'une seconde au plus.
       */
      for (const wait of [0, 120, 200, 300, 400]) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const c = list.find(mine);
        if (c) {
          if ("navigate" in c) await c.navigate(target).catch(() => {});
          if ("focus" in c) await c.focus().catch(() => {});
          return;
        }
      }
      // Personne n'a rien ouvert : c'est bien à nous de le faire.
      await self.clients.openWindow(target);
    })()
  );
});

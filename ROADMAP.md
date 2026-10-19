# Ce qui vient ensuite

**Tout est fait.** Les batchs A à E sont en place ; ce fichier reste pour les
décisions qu'ils ont tranchées, et pour les deux réserves ci-dessous.

Décisions arrêtées avec Rémi. Les batchs sont ordonnés par dépendance, pas
par priorité — D et E peuvent passer à tout moment.

---

## A — Une URL par event *(socle)*

Aujourd'hui l'app n'a qu'un écran : rien à partager, et une notification ne
peut ouvrir que l'accueil.

- Vraie route `/event/<id>`
- **Aperçu WhatsApp riche** : titre + date. Conséquence assumée — ces deux
  infos deviennent lisibles par quiconque a l'URL, connecté ou non, puisque
  WhatsApp lit le lien sans session. Les identifiants sont des UUID, donc
  le risque se limite à un lien transféré.
- Un non-membre qui ouvre le lien voit **« demande une invitation »**, pas
  l'écran de connexion brut
- Un seul bouton **Partager**, qui ouvre le menu natif du téléphone
- Remplace le bricolage d'historique de `useCloseOnBack` : le retour
  navigateur devient de la vraie navigation

Débloque le partage et les notifications qui visent juste.

---

## B — Notifications, suite

**Nouvelle règle : les events où tu es chaud.** Prévenu quand :
- la date ou le lieu changent
- l'event est annulé
- un sondage se clôt

Pas sur les commentaires — écarté comme trop bruyant.

**Rappel quotidien, vers 8h30.** Qui s'est ajouté depuis hier sur les plans
où tu es chaud, en une seule notification. Remplace une notification par
personne, qui aurait pu en faire quatorze pour un seul event.

> Demande une **tâche planifiée** — la première notification qui part sans
> que personne ne soit dans l'app. Vercel en autorise une par jour sur le
> plan gratuit, ce qui suffit. Elle n'aura pas de session utilisateur : à
> résoudre par une fonction SQL `security definer` protégée par un secret
> partagé, plutôt qu'en introduisant une clé `service_role` dans le projet.

**Plusieurs villes**, cases à cocher, en remplacement du réglage unique.

**Meilleur contenu** : le titre de l'event en première ligne, la date et le
lieu en dessous, et le nom de qui a agi.

---

## C — Page Réglages

Une vraie page, qui reprend :
- les notifications (activation, villes, interrupteurs par type)
- **ton compte** — changer son blaze et son mot de passe, ce qui n'existe
  nulle part aujourd'hui : un blaze mal tapé est définitif
- qui est dans le groupe

Le menu rapide se réduit à : ton nom, **Réglages**, **Se déconnecter**.

La ville quitte le menu rapide : avec plusieurs villes ça devient une liste
à cocher, trop lourde pour un menu, et on n'y touche qu'une fois par an.

> **En suspens** : Rémi a choisi de *retirer* le lien d'invitation, sans
> reconfirmer après que la conséquence lui a été signalée — chaque nouvel ami
> repasserait par du SQL. Il est donc **conservé**, dans les Réglages, à côté
> de la liste des membres. Le retirer reste une suppression de quelques lignes.

---

## D — Confort de saisie

- **Autocomplétion des lieux** dès 3 caractères, piochée dans tous les lieux
  déjà saisis par le groupe — events passés et propositions de sondage
- Le sélecteur de **date de fin** s'ouvre sur le mois de la date de début

---

## E — Retouches

- Date moins grasse dans les sondages
- Bouton **« Ajouter à mon agenda »**, explicite : aujourd'hui on ne comprend
  pas ce qu'il fait

---

# Après le multi-groupes

Décisions arrêtées avec Rémi le 20 octobre 2026, à faire **après l'étape 3**
(réglages d'admin) et sa mise en prod. Prototype jetable des pistes sur la
branche `prototype/accueil` (`?variant=B|C|D` sur l'accueil).

## F — Un accueil plus léger

Avec une vingtaine d'events, la liste devient lourde : sept informations par
carte, la date noyée en deuxième ligne, rien ne distingue ce qui attend un
geste.

**« À toi de jouer »**, en tête de l'accueil
- les events à venir sans ta réponse, et les sondages de date ou de lieu où
  tu n'as pas voté — un seul motif par event, le plus urgent
- **tous tes groupes**, l'emoji du groupe sur chaque ligne ; toucher ouvre
  l'event dans son groupe
- un « peut-être » est une réponse : il n'y revient pas

**La liste devient un agenda**, celle du **groupe ouvert**
- une seule liste : plus d'onglets Big events / Au quotidien, le big event se
  repère à ✨ et à sa durée. Le choix big / quotidien **reste à la création** :
  il règle la durée et qui est notifié
- intercalaires **« Cette semaine »**, puis un par mois
- une ligne par event : la date en gros à gauche, une ligne de détails
  (catégorie, ville, heure, nombre de chauds), et **ta réponse** en pastille
  à droite
- les villes restent un filtre, ouvert sur **« Toutes »**
- les dates à voter à la fin, le passé replié

**Un calendrier perso**, derrière une bascule **Liste / Calendrier** sous
« À toi de jouer » (variante E du prototype)
- **tous tes groupes** : c'est ton agenda, pas celui d'un groupe
- un mois en grille, semaine du lundi ; chaque event en barre sur toute sa
  durée, colorée par ta réponse : **vert** j'y vais, **orange** peut-être,
  **gris pointillé** sans réponse
- un event **refusé quitte le calendrier** ; il reste dans la liste, pastille
  rouge, pour pouvoir changer d'avis
- toucher un jour liste ses events dessous ; « Seulement mes plans » ne
  garde que le vert et l'orange
- les anniversaires en 🎂 sur la case, sans barre

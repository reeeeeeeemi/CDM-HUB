"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Users, CalendarDays, MapPin, ChevronLeft, ChevronDown, Check, HelpCircle,
  X, Trash2, Sparkles, Send, Wallet, MessageCircle, Link2,
  ExternalLink, MessageSquare, ListTodo, CheckCircle2, Circle, CalendarClock, Lock,
  Car, Plane, TrainFront, UserPlus, Navigation, CalendarX, AlertTriangle, CalendarPlus,
  House, Map as MapIcon, MapPinned, ShoppingCart, BedDouble, Share2,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  HUB Events — le hub de plans d'un groupe d'amis
 *  NOTE backend (Supabase) : notifications push quand un event est créé
 *  dans une ville suivie / en global ; synchro Google Calendar (OAuth)
 *  pour remplir les Dispos via free/busy. Apple = pas d'API propre.
 * ------------------------------------------------------------------ */

// ---------- données ----------
// Tout passe par lib/hub-data : la base est normalisée, l'interface travaille
// sur la forme imbriquée héritée du prototype, et la traduction vit là-bas.
import * as db from "@/lib/hub-data";
import { nameOf } from "@/lib/hub-data";
import { APP_NAME, CITIES } from "@/lib/brand";
import {
  savePushSubscription, removePushSubscription, notifyNewEvent, notifyEventActivity,
} from "@/lib/actions/push";

// ---------- config ----------
const CATS = {
  soiree:  { label: "Soirée",      color: "#7C3AED", emoji: "🎉" },
  sport:   { label: "Sport",       color: "#0D9488", emoji: "⚽" },
  resto:   { label: "Resto",       color: "#EA580C", emoji: "🍽️" },
  picnic:  { label: "Pique-nique", color: "#65A30D", emoji: "🧺" },
  voyage:  { label: "Voyage",      color: "#2563EB", emoji: "✈️" },
  coinche: { label: "Coinche",     color: "#DB2777", emoji: "🃏" },
  autre:   { label: "Autre",       color: "#64748B", emoji: "📌" },
};
const CITY_LIST = Object.keys(CITIES);
// Toute ville hors liste garde une épingle en guise d'emoji.
const cityEmoji = (c) => CITIES[c] || "📍";
// Initiales : une lettre par mot, deux au plus. « Ankara Messi » → AM,
// « Kenny » → KE. Sert de pastille devant le nom, jamais à sa place.
const initials = (name) => {
  const w = String(name || "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : String(name || "").slice(0, 2)).toUpperCase();
};
// `time` dit quelle heure a du sens pour ce mode — et donc s'il faut
// afficher le champ. Toujours facultatif.
const TRANSPORT = {
  voiture: { label: "Je conduis",        icon: Car,        color: "#0D9488", driver: true, time: "depart" },
  covoit:  { label: "Cherche une place", icon: UserPlus,   color: "#D97706", seeker: true },
  train:   { label: "En train",          icon: TrainFront, color: "#2563EB", time: "arrivee" },
  avion:   { label: "En avion",          icon: Plane,      color: "#7C3AED", time: "arrivee" },
  autre:   { label: "Par mes moyens",    icon: Navigation, color: "#64748B" },
};
const TIME_LABEL = { depart: "Heure de départ", arrivee: "Heure d'arrivée sur place" };
const TIME_SHORT = { depart: "part à", arrivee: "arrive à" };
// modules par défaut selon le type d'event
// Big comme quotidien : rien par défaut, on coche ce dont on a besoin.
const MODULES_BIG   = { transport: false, hosting: false, datePoll: false, placePoll: false, todos: false, courses: false, comments: false };
// Un event quotidien part vierge : on ajoute seulement ce dont on a besoin.
const MODULES_DAILY = { transport: false, hosting: false, datePoll: false, placePoll: false, todos: false, courses: false, comments: false };
const MODULE_LABELS = [
  ["transport", "Qui y va comment"],
  ["hosting", "Qui peut héberger"],
  ["datePoll", "Sondage de dates"],
  ["placePoll", "Sondage de lieu"],
  ["todos", "To-Do"],
  ["courses", "Liste de courses"],
  ["comments", "Commentaires"],
];

// Ce que chaque section apportera à l'event — sert l'aperçu du formulaire.
const MODULE_META = {
  transport: { icon: Car,           title: "Qui y va comment ?",  hint: "Chacun dit s'il conduit, cherche une place, ou arrive en train." },
  hosting:   { icon: BedDouble,     title: "Qui peut héberger ?", hint: "Qui offre des places, qui cherche un lit." },
  datePoll:  { icon: CalendarClock, title: "Sondage de dates",    hint: "Proposez des créneaux, chacun vote selon ses dispos." },
  placePoll: { icon: MapPinned,     title: "Sondage de lieu",     hint: "Proposez des endroits avec leur lien Maps, chacun vote." },
  todos:     { icon: ListTodo,      title: "To-Do",               hint: "Ce qu'il y a à faire, chacun coche ce qu'il prend en charge." },
  courses:   { icon: ShoppingCart,  title: "Liste de courses",    hint: "Ce qu'il faut acheter, et qui le ramène." },
  comments:  { icon: MessageSquare, title: "Commentaires",        hint: "Le fil de discussion de l'event." },
};

// Les identifiants sont générés ici pour que l'affichage optimiste et la
// ligne écrite en base portent le même id.
//
// crypto.randomUUID n'existe qu'en contexte sécurisé : en HTTPS ou sur
// localhost, mais pas sur http://192.168.x.x, d'où un repli. getRandomValues,
// lui, reste disponible partout.
const uid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = [...b].map((x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
};
const normUrl = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : "https://" + u);
const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
  if (!d) return "Date à définir";
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
// Les créneaux d'un sondage peuvent tomber l'an prochain : l'année compte.
const pollDate = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const pollRange = (start, end) =>
  !end || end === start ? pollDate(start) : `${pollDate(start)} – ${pollDate(end)}`;

function fmtRange(start, end) {
  if (!start) return "Date à définir";
  if (!end || end === start) return fmtDate(start);
  return `Du ${shortDate(start)} au ${shortDate(end)}`;
}
function countdown(start, end, time) {
  if (!start) return null;
  const s = new Date(start + "T" + (time || "00:00"));
  const e = new Date((end || start) + "T23:59");
  const now = new Date();
  if (now < s) {
    const diff = s - now, days = Math.floor(diff / 86400000), hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return { text: `J-${days}` };
    if (hours > 0) return { text: `Dans ${hours} h` };
    return { text: "Aujourd'hui !", soon: true };
  }
  if (now >= s && now <= e) return { text: "En cours", live: true };
  return { past: true, text: "Passé" };
}
function timeAgo(ms) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 60000) return "à l'instant";
  const m = Math.floor(diff / 60000); if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(diff / 3600000); if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(diff / 86400000); if (d === 1) return "hier"; if (d < 7) return `il y a ${d} j`;
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
const RS = {
  in:    { label: "Je viens",  short: "vient",  color: "#0D9488", icon: Check },
  maybe: { label: "Peut-être", short: "hésite", color: "#D97706", icon: HelpCircle },
  out:   { label: "Pas dispo", short: "absent", color: "#94A3B8", icon: X },
};
const LINK_KINDS = {
  tricount:  { label: "Tricount",  icon: Wallet,        color: "#1BA0A6" },
  messenger: { label: "Messenger", icon: MessageCircle, color: "#0A7CFF" },
  airbnb:    { label: "Airbnb",    icon: House,         color: "#FF5A5F" },
  maps:      { label: "Google Maps", icon: MapIcon,     color: "#1A73E8" },
  other:     { label: "Lien",      icon: Link2,         color: "#B4451F" },
};
const modOn = (ev, key) => (ev.modules || (ev.scale === "big" ? MODULES_BIG : MODULES_DAILY))[key] !== false;

// ---------- export agenda (.ics + Google) ----------
function toICSDate(date, time, allDay) {
  if (allDay) return date.replace(/-/g, "");
  const t = (time || "00:00").replace(":", "") + "00";
  return date.replace(/-/g, "") + "T" + t;
}
function addDay(date) { const x = new Date(date + "T00:00:00"); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); }
function icsContent(ev) {
  const allDay = ev.scale === "big" || !ev.time;
  const start = ev.date;
  const end = ev.endDate || ev.date;
  let dtStart, dtEnd;
  if (allDay) { dtStart = `DTSTART;VALUE=DATE:${toICSDate(start, null, true)}`; dtEnd = `DTEND;VALUE=DATE:${toICSDate(addDay(end), null, true)}`; }
  else {
    dtStart = `DTSTART:${toICSDate(start, ev.time)}`;
    dtEnd = `DTEND:${toICSDate(end, ev.endTime || ev.time)}`;
  }
  const esc = (s) => (s || "").replace(/[,;\\]/g, (m) => "\\" + m).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${APP_NAME}//FR`, "BEGIN:VEVENT",
    `UID:${ev.id}@cdm-hub`, `SUMMARY:${esc(ev.title)}`, dtStart, dtEnd,
    ev.place ? `LOCATION:${esc(ev.place + (ev.city ? ", " + ev.city : ""))}` : "",
    ev.description ? `DESCRIPTION:${esc(ev.description)}` : "",
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
function downloadICS(ev) {
  try {
    const blob = new Blob([icsContent(ev)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${ev.title.replace(/[^\w]+/g, "_")}.ics`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) { console.error(e); }
}
function googleCalUrl(ev) {
  const allDay = ev.scale === "big" || !ev.time;
  const start = allDay ? toICSDate(ev.date, null, true) : toICSDate(ev.date, ev.time);
  const end = allDay ? toICSDate(addDay(ev.endDate || ev.date), null, true) : toICSDate(ev.endDate || ev.date, ev.endTime || ev.time);
  const p = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: `${start}/${end}`,
    details: ev.description || "", location: (ev.place || "") + (ev.city ? ", " + ev.city : "") });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}

// ---------- retour navigateur ----------
/**
 * Empile une entrée d'historique tant qu'une vue superposée est ouverte —
 * fiche d'event, formulaire de création — et la referme quand le navigateur
 * revient en arrière.
 *
 * Sans ça l'app ne navigue nulle part aux yeux du navigateur : ouvrir un
 * event ne change qu'un état React. Le geste de bord sur iOS et le bouton
 * retour sur Android quittaient donc l'app au lieu de revenir à la liste.
 *
 * `close` doit être stable (useCallback) : une fonction recréée à chaque
 * rendu relancerait l'effet, et empilerait une entrée par rendu.
 */
function useCloseOnBack(open, close) {
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ hubOverlay: true }, "");
    const onPop = () => close();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Fermeture par un bouton de l'app : l'entrée empilée n'a plus d'objet.
      // La retirer évite de laisser derrière soi un retour qui ne fait rien.
      if (window.history.state?.hubOverlay) window.history.back();
    };
  }, [open, close]);
}

/**
 * Champ de lieu, avec rappel de ce que le groupe a déjà saisi.
 *
 * Les suggestions n'apparaissent qu'à partir de 3 caractères : en deçà la
 * liste proposerait presque tout, et gênerait la frappe au lieu de l'aider.
 */
function PlaceInput({ value, onChange, places, placeholder, onEnter }) {
  const [open, setOpen] = useState(true);
  const q = value.trim().toLowerCase();
  const hits =
    q.length >= 3
      ? (places || []).filter((p) => {
          const l = p.toLowerCase();
          return l.includes(q) && l !== q;
        }).slice(0, 5)
      : [];

  return (
    <div className="ac">
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") { setOpen(false); onEnter?.(); }
        }}
      />
      {open && hits.length > 0 && (
        <div className="ac-list">
          {hits.map((pl) => (
            <button key={pl} type="button" className="ac-item"
              onClick={() => { onChange(pl); setOpen(false); }}>
              <MapPin size={13} /> {pl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- notifications ----------
// Les trois règles, telles qu'elles apparaissent dans le menu. Les clés
// correspondent aux colonnes notify_* de profiles.
const PREFS = [
  ["big",  "Les big events"],
  ["city", "Les plans dans ma ville"],
  ["mine", "Les réactions sur mes events"],
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
function usePush() {
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

// ---------- app ----------
/**
 * `me` vient du compte connecté (voir app/page.tsx). Quand il est fourni,
 * l'écran Onboarding ne s'affiche plus : l'identité est déjà connue.
 *
 * @param {{ me?: string | null, meName?: string, onSignOut?: (() => void | Promise<void>) | null,
 *          notifyCity?: string, onSetCity?: ((city: string) => void) | null,
 *          onInvite?: (() => Promise<{ url?: string, error?: string }>) | null,
 *          notifyPrefs?: { big: boolean, city: boolean, mine: boolean } | null,
 *          onSetPrefs?: ((prefs: Record<string, boolean>) => void) | null,
 *          initialEvent?: string | null }} props
 */
export default function App({ me: meFromAuth = null, meName = "", onSignOut = null, notifyCity = "", onSetCity = null, onInvite = null, notifyPrefs = null, onSetPrefs = null, initialEvent = null }) {
  const [me, setMe] = useState(meFromAuth);
  const [tab, setTab] = useState("events");
  const [scale, setScale] = useState("big");
  // Un filtre de ville par échelle. Au quotidien, on part de la ville du
  // profil : un plan resto à Bordeaux ne concerne pas qui vit à Toulouse.
  // Les big events, eux, s'ouvrent sur « Toutes » — un ski se monte ailleurs
  // que chez soi, et le filtrer par défaut le ferait disparaître.
  const [cityBig, setCityBig] = useState("all");
  const [cityDaily, setCityDaily] = useState(notifyCity || "all");
  const city = scale === "big" ? cityBig : cityDaily;
  const setCity = scale === "big" ? setCityBig : setCityDaily;
  const [events, setEvents] = useState([]);
  const [availability, setAvailability] = useState([]);
  // Renseigné quand on arrive par un lien partagé ou une notification.
  const [selected, setSelected] = useState(initialEvent || null);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newCities, setNewCities] = useState(new Set());

  const [loadError, setLoadError] = useState("");

  /**
   * Ouvrir un event change l'URL sans recharger la page. pushState est
   * intégré au routeur de Next, qui reste donc d'accord avec ce qui est
   * affiché — et le lien devient partageable.
   */
  const openEvent = useCallback((id) => {
    setSelected(id);
    window.history.pushState({ hubEvent: true }, "", `/event/${id}`);
  }, []);

  const closeEvent = useCallback(() => {
    setSelected(null);
    // Si c'est nous qui avons empilé l'entrée, on la dépile : le bouton
    // Retour de la fiche et celui du navigateur laissent le même historique.
    if (window.history.state?.hubEvent) window.history.back();
    // Sinon on vient d'un lien externe : réécrire l'URL sans toucher à
    // l'historique, pour ne pas renvoyer le visiteur d'où il venait.
    else if (window.location.pathname !== "/") window.history.replaceState(null, "", "/");
  }, []);

  // Le retour du navigateur fait foi : on relit l'URL plutôt que de deviner.
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/^\/event\/([^/]+)/);
      setSelected(m ? m[1] : null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);
  useCloseOnBack(Boolean(modal), closeModal);

  const reload = useCallback(async () => {
    try {
      const { events: evs, availability: av } = await db.loadHub();
      setEvents(evs);
      setAvailability(av);
      setLoadError("");
      return evs;
    } catch (e) {
      setLoadError(e?.message || "Impossible de joindre le hub.");
      return null;
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (meFromAuth) setMe(meFromAuth);
      const evs = await reload();
      // Signale les villes où un plan est apparu depuis la dernière visite.
      // lastSeen reste local : c'est une préférence d'affichage, pas une donnée
      // du groupe.
      const lastSeen = Number(window.localStorage.getItem("cdm:lastSeen") || 0);
      if (evs && meFromAuth && lastSeen) {
        setNewCities(new Set(
          evs.filter((e) => (e.createdAt || 0) > lastSeen && e.createdBy !== meFromAuth && e.city).map((e) => e.city)
        ));
      }
      try { window.localStorage.setItem("cdm:lastSeen", String(Date.now())); } catch {}
      setLoading(false);
    })();
  }, [meFromAuth, reload]);

  // Les données ne sont chargées qu'au montage. Or sur l'écran d'accueil, iOS
  // ré-affiche l'app telle qu'elle était sans recharger la page : sans ça on
  // peut consulter l'état de la base d'il y a plusieurs heures sans le savoir.
  // Date.now() resterait un appel impur pendant le rendu : on l'amorce
  // depuis l'effet, qui ne tourne qu'une fois.
  const lastLoad = useRef(0);
  useEffect(() => {
    lastLoad.current = Date.now();
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      // Marge de 30 s : passer deux secondes sur une autre app ne justifie
      // pas de tout redemander à la base.
      if (Date.now() - lastLoad.current < 30_000) return;
      lastLoad.current = Date.now();
      reload();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [reload]);

  // Les 5 villes habituelles, plus toute ville libre qui a au moins un event —
  // sinon un event à Lisbonne ne serait atteignable que par « Toutes ».
  const cityChips = useMemo(() => {
    // La ville du profil figure toujours, même sans event : sinon le filtre
    // serait actif sans qu'aucune pastille ne montre laquelle est retenue.
    const free = [...events.map((e) => e.city), notifyCity];
    const extra = [...new Set(free.filter((c) => c && !CITIES[c]))].sort();
    return [...CITY_LIST, ...extra];
  }, [events, notifyCity]);

  // Toute action suit le même schéma : l'écran change tout de suite, l'écriture
  // part derrière, et si la base refuse on recharge pour revenir au vrai.
  const persist = useCallback(async (run) => {
    const { error } = (await run()) || {};
    if (error) { console.error(error); setLoadError(error.message); await reload(); }
  }, [reload]);

  const updateEvent = useCallback((id, updater) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? updater(e) : e)));
  }, []);

  const addEvent = async (e) => {
    const row = { ...e, id: uid(), createdBy: me, createdAt: Date.now() };
    setEvents((prev) => [{ ...row, rsvps: { [me]: "in" }, comments: [], todos: [], datePoll: [], placePoll: [], transport: [], hosting: [] }, ...prev]);
    setModal(null);
    await persist(() => db.insertEvent(row, me));
    // Le créateur est chaud par défaut : une ligne de plus, à part.
    await persist(() => db.setRsvp(row.id, me, "in"));
    // Règles 1 et 2 : big event pour tout le groupe, plan du quotidien pour
    // ceux qui vivent dans la ville. La base tranche, on ne fait qu'annoncer.
    // Volontairement sans await : une notification qui échoue ne doit pas
    // remonter comme un échec de création.
    notifyNewEvent(row.id, row.title, row.scale, row.city || "").catch(() => {});
  };

  const delEvent = useCallback(async (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    closeEvent();
    await persist(() => db.deleteEvent(id));
  }, [persist, closeEvent]);

  const actions = useMemo(() => ({
    // Recliquer sur sa réponse la retire : on redevient « sans réponse »,
    // ce qui n'est pas la même chose que « pas dispo ».
    rsvp: (id, s) => {
      let status = s, title = "";
      updateEvent(id, (e) => {
        title = e.title;
        const next = { ...e.rsvps };
        if (next[me] === s) { delete next[me]; status = null; }
        else next[me] = s;
        return { ...e, rsvps: next };
      });
      persist(() => db.setRsvp(id, me, status));
      // Règle 3, versant réponses. Seul « chaud » prévient l'auteur : un
      // « peut-être » ou un désistement ne vaut pas de faire vibrer un
      // téléphone, et la base écarte déjà le cas de son propre event.
      if (status === "in") notifyEventActivity(id, title, `${meName} est chaud`).catch(() => {});
    },
    del: delEvent,
    setModule: (id, key, val) => {
      let modules;
      updateEvent(id, (e) => {
        modules = { ...(e.modules || (e.scale === "big" ? MODULES_BIG : MODULES_DAILY)), [key]: val };
        return { ...e, modules };
      });
      persist(() => db.patchEvent(id, { modules }));
    },

    addComment: (id, text) => {
      const cid = uid();
      let title = "";
      updateEvent(id, (e) => {
        title = e.title;
        return { ...e, comments: [...(e.comments || []), { id: cid, by: me, text, at: Date.now() }] };
      });
      persist(() => db.addComment(cid, id, me, text));
      // Règle 3, versant commentaires. Le texte part dans la notification :
      // le plus souvent il se suffit, et évite d'ouvrir l'app pour rien.
      notifyEventActivity(id, title, `${meName} : ${text}`).catch(() => {});
    },
    delComment: (id, cid) => {
      updateEvent(id, (e) => ({ ...e, comments: (e.comments || []).filter((c) => c.id !== cid) }));
      persist(() => db.delComment(cid));
    },

    addTodo: (id, text, kind = "todo") => {
      const tid = uid();
      updateEvent(id, (e) => ({ ...e, todos: [...(e.todos || []), { id: tid, text, kind, by: me, done: false }] }));
      persist(() => db.addTodo(tid, id, me, text, kind));
    },
    toggleTodo: (id, tid) => {
      let done;
      updateEvent(id, (e) => ({ ...e, todos: (e.todos || []).map((t) => {
        if (t.id !== tid) return t;
        done = !t.done;
        return { ...t, done, doneBy: done ? me : null };
      }) }));
      persist(() => db.setTodoDone(tid, done, me));
    },
    delTodo: (id, tid) => {
      updateEvent(id, (e) => ({ ...e, todos: (e.todos || []).filter((t) => t.id !== tid) }));
      persist(() => db.delTodo(tid));
    },

    addDate: (id, date, endDate = "") => {
      const oid = uid();
      updateEvent(id, (e) => ({ ...e, datePoll: [...(e.datePoll || []), { id: oid, date, endDate, by: me, votes: [me] }] }));
      // Proposer, c'est voter pour : deux lignes, une seule intention.
      persist(async () => {
        const r = await db.addDateOption(oid, id, me, date, endDate);
        return r.error ? r : await db.voteDate(oid, me, true);
      });
    },
    delDate: (id, oid) => {
      updateEvent(id, (e) => ({ ...e, datePoll: (e.datePoll || []).filter((o) => o.id !== oid) }));
      persist(() => db.delDateOption(oid));
    },
    voteDate: (id, oid) => {
      let on;
      updateEvent(id, (e) => ({ ...e, datePoll: (e.datePoll || []).map((o) => {
        if (o.id !== oid) return o;
        on = !o.votes.includes(me);
        return { ...o, votes: on ? [...o.votes, me] : o.votes.filter((v) => v !== me) };
      }) }));
      persist(() => db.voteDate(oid, me, on));
    },
    lockDate: (id, oid) => {
      let patch;
      updateEvent(id, (e) => {
        const o = (e.datePoll || []).find((x) => x.id === oid);
        if (!o) return e;
        patch = { starts_on: o.date, ends_on: o.endDate || null };
        return { ...e, date: o.date, endDate: o.endDate || "" };
      });
      if (patch) persist(() => db.patchEvent(id, patch));
    },

    setTransport: (id, entry) => {
      updateEvent(id, (e) => ({ ...e, transport: [...(e.transport || []).filter((t) => t.by !== me), { id: me, by: me, ...entry }] }));
      persist(() => db.setTransport(id, me, entry));
    },
    delTransport: (id) => {
      updateEvent(id, (e) => ({ ...e, transport: (e.transport || []).filter((t) => t.by !== me) }));
      persist(() => db.delTransport(id, me));
    },

    addPlace: (id, label, url) => {
      const oid = uid();
      updateEvent(id, (e) => ({ ...e, placePoll: [...(e.placePoll || []), { id: oid, label, url, by: me, votes: [me] }] }));
      persist(async () => {
        const r = await db.addPlaceOption(oid, id, me, label, url);
        return r.error ? r : await db.votePlace(oid, me, true);
      });
    },
    votePlace: (id, oid) => {
      let on;
      updateEvent(id, (e) => ({ ...e, placePoll: (e.placePoll || []).map((o) => {
        if (o.id !== oid) return o;
        on = !o.votes.includes(me);
        return { ...o, votes: on ? [...o.votes, me] : o.votes.filter((v) => v !== me) };
      }) }));
      persist(() => db.votePlace(oid, me, on));
    },
    delPlace: (id, oid) => {
      updateEvent(id, (e) => ({ ...e, placePoll: (e.placePoll || []).filter((o) => o.id !== oid) }));
      persist(() => db.delPlaceOption(oid));
    },
    lockPlace: (id, oid) => {
      let patch;
      updateEvent(id, (e) => {
        const o = (e.placePoll || []).find((x) => x.id === oid);
        if (!o) return e;
        patch = { place: o.label, place_url: o.url || null };
        return { ...e, place: o.label, placeUrl: o.url || "" };
      });
      if (patch) persist(() => db.patchEvent(id, patch));
    },

    setHosting: (id, entry) => {
      updateEvent(id, (e) => ({ ...e, hosting: [...(e.hosting || []).filter((h) => h.by !== me), { id: me, by: me, ...entry }] }));
      persist(() => db.setHosting(id, me, entry));
    },
    delHosting: (id) => {
      updateEvent(id, (e) => ({ ...e, hosting: (e.hosting || []).filter((h) => h.by !== me) }));
      persist(() => db.delHosting(id, me));
    },
  }), [me, meName, updateEvent, persist, delEvent]);

  /* eslint-disable @typescript-eslint/no-unused-vars --
     L'onglet Dispos est en pause côté navigation, mais ses écritures sont
     branchées : le rebrancher ne demandera qu'une ligne de rendu. */
  const addAvail = (o) => {
    const row = { ...o, id: uid(), by: me };
    setAvailability((prev) => [row, ...prev]);
    persist(() => db.addAvailability(row.id, me, o));
  };
  const delAvail = (id) => {
    setAvailability((prev) => prev.filter((a) => a.id !== id));
    persist(() => db.delAvailability(id));
  };
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // Le titre du header ramène à la liste, quel que soit l'endroit où on est.
  const goHome = () => { closeEvent(); setTab("events"); };

  const pickCity = (c) => {
    setCity(c);
    setNewCities((prev) => { const n = new Set(prev); if (c === "all") return new Set(); n.delete(c); return n; });
  };

  const filtered = useMemo(() => {
    const match = events.filter((e) => (e.scale || "daily") === scale && (city === "all" || e.city === city));
    const keyed = match.map((e) => ({ e, k: e.date || "9999" }));
    keyed.sort((a, b) => a.k.localeCompare(b.k));
    const now = todayStr();
    const isPast = (e) => (e.endDate || e.date) && (e.endDate || e.date) < now;
    return { up: keyed.filter((x) => !isPast(x.e)).map((x) => x.e), past: keyed.filter((x) => isPast(x.e)).reverse().map((x) => x.e) };
  }, [events, scale, city]);

  // Tous les lieux déjà écrits par le groupe : ceux des events et ceux des
  // sondages. Rien à demander à la base, tout est déjà chargé.
  const places = useMemo(() => {
    const all = new Set();
    events.forEach((e) => {
      if (e.place) all.add(e.place.trim());
      (e.placePoll || []).forEach((o) => o.label && all.add(o.label.trim()));
    });
    return [...all].filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));
  }, [events]);

  const selectedEvent = events.find((e) => e.id === selected);

  return (
    <div className="root">
      <style>{CSS}</style>
      {loading ? (
        <div className="center"><div className="spinner" /></div>
      ) : (
        <>
          {/* Le header reste en place partout : liste comme fiche d'event. */}
          <Header meName={meName} onSignOut={onSignOut} notifyCity={notifyCity} onSetCity={onSetCity} onHome={goHome} onInvite={onInvite} notifyPrefs={notifyPrefs} onSetPrefs={onSetPrefs} />
          {selectedEvent ? (
            <EventDetail ev={selectedEvent} me={me} actions={actions} availability={availability} onBack={closeEvent} places={places} />
          ) : (
            <>
          {loadError && (
            <div className="load-err" role="alert">
              <AlertTriangle size={15} />
              <span>{loadError}</span>
              <button onClick={() => reload()}>Réessayer</button>
            </div>
          )}
          <Tabs tab={tab} setTab={setTab} newCount={newCities.size} />
          <main className="wrap">
            {tab === "events" && (
              <>
                <div className="seg">
                  <button className={scale === "big" ? "on" : ""} onClick={() => setScale("big")}><Sparkles size={15} /> Big events</button>
                  <button className={scale === "daily" ? "on" : ""} onClick={() => setScale("daily")}>Au quotidien</button>
                </div>
                <div className="cities">
                  <button className={"citychip" + (city === "all" ? " on" : "")} onClick={() => pickCity("all")}>Toutes</button>
                  {cityChips.map((c) => (
                    <button key={c} className={"citychip" + (city === c ? " on" : "")} onClick={() => pickCity(c)}>
                      {cityEmoji(c)} {c}{newCities.has(c) && <span className="dot" />}
                    </button>
                  ))}
                </div>
                <EventsView data={filtered} me={me} onOpen={openEvent} scale={scale} />
              </>
            )}
            {tab === "avail" && (
              <Empty icon={<CalendarX size={26} />} title="À venir dans une prochaine MAJ"
                text="Les dispos permettront de dire quand tu n'es pas là, pour que les sondages de dates en tiennent compte." />
            )}
          </main>
          {tab === "events" && (
            <button className="fab" onClick={() => setModal("event")}>
              <Plus size={22} strokeWidth={2.4} />
              <span>{scale === "big" ? "Ajouter un big event" : "Ajouter un event quotidien"}</span>
            </button>
          )}
            </>
          )}
        </>
      )}
      {modal === "event" && <EventForm defScale={scale} defCity={city !== "all" ? city : ""} onClose={closeModal} onSave={addEvent} places={places} />}
    </div>
  );
}


// ---------- header + tabs ----------
function Header({ meName, onSignOut, notifyCity, onSetCity, onHome, onInvite, notifyPrefs, onSetPrefs }) {
  const [open, setOpen] = useState(false);
  const push = usePush();
  // Optimiste, comme la ville : la case bascule tout de suite, l'écriture suit.
  const [prefs, setPrefs] = useState(notifyPrefs || { big: true, city: true, mine: true });
  const flipPref = (k) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    // Un seul interrupteur part : deux onglets ouverts ne s'écrasent pas.
    onSetPrefs?.({ [k]: next[k] });
  };
  const [invite, setInvite] = useState("");
  const [making, setMaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [invErr, setInvErr] = useState("");

  const makeInvite = async () => {
    setMaking(true); setInvErr("");
    const r = await onInvite();
    setMaking(false);
    if (r?.url) setInvite(r.url);
    else setInvErr(r?.error || "Impossible de créer le lien.");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Le presse-papier est refusé hors HTTPS : on montre le lien à copier.
      setInvErr(invite);
    }
  };
  const [stuck, setStuck] = useState(false);

  // Le filet sous le header n'apparaît qu'une fois du contenu passé dessous.
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Optimiste : la puce se coche tout de suite, l'enregistrement suit.
  const [city, setCity] = useState(notifyCity || "");
  const pick = (c) => { const next = city === c ? "" : c; setCity(next); onSetCity?.(next); };
  return (
    <header className={"hd" + (stuck ? " stuck" : "")}>
      <h1 className="hd-title-wrap">
        <button type="button" className="hd-kicker" onClick={onHome} title="Revenir à l'accueil">
          <Users size={13} /> {APP_NAME}
        </button>
      </h1>
      <div className="hd-menu-wrap">
        <button type="button" className="hd-me" aria-haspopup="menu" aria-expanded={open}
          title={meName} onClick={() => setOpen((o) => !o)}>{meName.slice(0, 2).toUpperCase()}</button>
        {open && (
          <>
            <div className="hd-backdrop" onClick={() => setOpen(false)} />
            <div className="hd-menu" role="menu">
              <div className="hd-menu-me">{meName}</div>

              <div className="hd-menu-sec">Me prévenir des events à</div>
              <p className="hd-menu-hint">Tu seras signalé quand un plan est publié dans cette ville.</p>
              <div className="hd-menu-cities">
                {CITY_LIST.map((c) => (
                  <button key={c} type="button" className={"catchip city" + (city === c ? " on" : "")}
                    onClick={() => pick(c)}>{CITIES[c]} {c}</button>
                ))}
              </div>

              <div className="hd-menu-inv">
                <div className="hd-menu-sec">Notifications</div>
                {push.state === "unsupported" ? (
                  <p className="hd-menu-hint">
                    Ajoute d&apos;abord l&apos;app à ton écran d&apos;accueil : sur iPhone,
                    les notifications n&apos;existent que là.
                  </p>
                ) : push.state === "denied" ? (
                  <p className="hd-menu-hint">
                    Tu les as refusées. Ça se rouvre dans les réglages de ton téléphone,
                    à la ligne de cette app.
                  </p>
                ) : (
                  <>
                    {push.state !== "on" && (
                      <p className="hd-menu-hint">
                        Les big events, les plans de ta ville, et les réactions sur les tiens.
                      </p>
                    )}
                    <button type="button" className="inv-make" disabled={push.busy || push.state === "checking"}
                      onClick={push.state === "on" ? push.disable : push.enable}>
                      {push.busy ? "Un instant…"
                        : push.state === "on" ? "Couper les notifications"
                        : "Activer les notifications"}
                    </button>
                    {push.state === "on" && onSetPrefs && (
                      <div className="hd-menu-prefs">
                        {PREFS.map(([k, label]) => (
                          <button key={k} type="button" role="switch" aria-checked={prefs[k]}
                            className={"pref" + (prefs[k] ? " on" : "")} onClick={() => flipPref(k)}>
                            <span className="pref-box">{prefs[k] && <Check size={12} strokeWidth={3} />}</span>
                            {label}
                          </button>
                        ))}
                        {prefs.city && !city && (
                          <p className="hd-menu-hint pref-warn">
                            Choisis ta ville juste au-dessus, sinon celle-ci ne t&apos;enverra rien.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {push.err && <p className="hd-menu-err">{push.err}</p>}
              </div>

              {onInvite && (
                <div className="hd-menu-inv">
                  <div className="hd-menu-sec">Inviter un ami</div>
                  {invite ? (
                    <>
                      <p className="hd-menu-hint">Valable 7 jours. Qui l&apos;ouvre rejoint le hub.</p>
                      <button type="button" className="inv-link" onClick={copy}>
                        {copied ? <><Check size={14} /> Lien copié</> : <><Link2 size={14} /> Copier le lien</>}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="inv-make" onClick={makeInvite} disabled={making}>
                      {making ? "Un instant…" : "Créer un lien d'invitation"}
                    </button>
                  )}
                  {invErr && <p className="hd-menu-err">{invErr}</p>}
                </div>
              )}

              {onSignOut && (
                <form action={onSignOut} className="hd-menu-out">
                  <button type="submit">Se déconnecter</button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
function Tabs({ tab, setTab, newCount }) {
  return (
    <div className="tabs">
      <button className={"tab" + (tab === "events" ? " on" : "")} onClick={() => setTab("events")}>
        <CalendarDays size={16} /> Événements {newCount > 0 && <span className="dot inline" />}
      </button>
      <button className={"tab" + (tab === "avail" ? " on" : "")} onClick={() => setTab("avail")}><CalendarX size={16} /> Dispos</button>
    </div>
  );
}

// ---------- events list ----------
function EventsView({ data, me, onOpen, scale }) {
  const [showPast, setShowPast] = useState(false);
  if (data.up.length === 0 && data.past.length === 0)
    return <Empty icon={<CalendarDays size={26} />} title={scale === "big" ? "Aucun big event ici" : "Rien de prévu ici"}
      text="Change de ville, ou lance le premier plan avec le bouton en bas." />;
  return (
    <>
      {data.up.length === 0 && <Empty icon={<CalendarDays size={26} />} title="Rien à venir ici" text="Les events passés sont plus bas." />}
      {data.up.map((ev) => <EventCard key={ev.id} ev={ev} me={me} onOpen={onOpen} />)}
      {data.past.length > 0 && (
        <div className="past-wrap">
          <button className={"past-toggle" + (showPast ? " open" : "")} onClick={() => setShowPast((v) => !v)}>
            <ChevronDown size={16} /> Events passés ({data.past.length})
          </button>
          {showPast && data.past.map((ev) => <EventCard key={ev.id} ev={ev} me={me} onOpen={onOpen} past />)}
        </div>
      )}
    </>
  );
}
function EventCard({ ev, me, onOpen, past }) {
  const cat = CATS[ev.category] || CATS.autre;
  const cd = countdown(ev.date, ev.endDate, ev.time);
  const going = Object.values(ev.rsvps || {}).filter((s) => s === "in").length;
  const mine = ev.rsvps?.[me];
  const noDate = !ev.date;
  return (
    <button className={"card" + (past ? " past" : "")} onClick={() => onOpen(ev.id)} style={{ "--cat": cat.color }}>
      <div className="card-stripe" />
      <div className="card-body">
        <div className="card-main">
          <span className="tag" style={{ color: cat.color, background: cat.color + "18" }}>{cat.emoji} {cat.label}</span>
          <h3 className="card-title">{ev.title}</h3>
          <div className="card-meta">
            <span><CalendarDays size={14} /> {fmtRange(ev.date, ev.endDate)}{ev.time && !ev.endDate ? ` · ${ev.time}` : ""}</span>
            {ev.city && <span>{cityEmoji(ev.city)} {ev.city}</span>}
          </div>
        </div>
        {/* Colonne de droite : quand, ta réponse, combien de chauds. Les trois
            repères qu'on lit en diagonale sur une liste, alignés entre eux
            plutôt que dispersés aux quatre coins de la carte. */}
        <div className="card-side">
          {noDate && !past ? <span className="cd poll"><CalendarClock size={12} /> Date à voter</span>
            : cd && !past && <span className={"cd" + (cd.live ? " live" : cd.soon ? " hot" : "")}>{cd.text}</span>}
          {!ev.place && modOn(ev, "placePoll") && !past && <span className="cd poll"><MapPinned size={12} /> Lieu à voter</span>}
          {mine && <span className="mine" style={{ color: RS[mine].color }}>Toi : {RS[mine].short}</span>}
          <span className="count"><Users size={14} /> {going} chaud{going > 1 ? "s" : ""}</span>
        </div>
      </div>
    </button>
  );
}

// ---------- event detail ----------
function EventDetail({ ev, me, actions, availability, onBack, places }) {
  const [confirmDel, setConfirmDel] = useState(false);
  const [shared, setShared] = useState(false);

  /**
   * Le partage natif ouvre le menu du téléphone — WhatsApp, Messenger, SMS,
   * selon ce qui est installé. Absent sur ordinateur et hors HTTPS : on
   * recopie le lien, ce qui revient au même en deux gestes de plus.
   */
  const share = async () => {
    const url = `${window.location.origin}/event/${ev.id}`;
    const line = ev.date ? `${ev.title} — ${fmtRange(ev.date, ev.endDate)}` : ev.title;
    if (navigator.share) {
      // Annuler le partage lève une exception : ce n'est pas une erreur.
      try { await navigator.share({ title: ev.title, text: line, url }); } catch {}
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {}
  };
  const cat = CATS[ev.category] || CATS.autre;
  const cd = countdown(ev.date, ev.endDate, ev.time);
  const groups = { in: [], maybe: [], out: [] };
  Object.entries(ev.rsvps || {}).forEach(([n, s]) => groups[s]?.push(n));
  const mine = ev.rsvps?.[me];
  const isBig = (ev.scale || "daily") === "big";
  const links = (ev.links || []).filter((l) => l.url);
  const isCreator = ev.createdBy === me;
  // Fin inférieure au début : l'event court jusqu'au lendemain.
  const overnight = Boolean(ev.time && ev.endTime && ev.endTime < ev.time);
  const timeLabel = ev.time
    ? (ev.endTime ? `${ev.time} – ${ev.endTime}${overnight ? " (le lendemain)" : ""}` : ev.time)
    : "";

  return (
    <div className="detail">
      <div className="detail-hero" style={{ background: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)` }}>
        <div className="detail-top">
          <button className="ghost-btn light" onClick={onBack}><ChevronLeft size={18} /> Retour</button>
          <button className="ghost-btn light" onClick={share}>
            {shared ? <><Check size={16} /> Lien copié</> : <><Share2 size={16} /> Partager</>}
          </button>
        </div>
        {ev.date && (
          <div className="cal-block">
            {/* Sous Partager : les deux gestes qu'on fait en découvrant un
                plan — le transmettre, et le poser dans son agenda.
                L'action d'abord, la destination ensuite : les boutons
                nommaient un agenda sans jamais dire ce qu'ils faisaient. */}
            <div className="cal-label"><CalendarPlus size={14} /> Ajouter à mon agenda</div>
            <div className="cal-row">
              <button className="cal-btn light" onClick={() => downloadICS(ev)}>Apple / iCal</button>
              <a className="cal-btn light" href={googleCalUrl(ev)} target="_blank" rel="noopener noreferrer">Google Agenda</a>
            </div>
          </div>
        )}
        <div className="detail-emoji">{cat.emoji}</div>
        <div className="detail-tags">
          <span className="tag light">{cat.label}</span>
          {isBig && <span className="tag light"><Sparkles size={12} /> Big event</span>}
          {ev.city && <span className="tag light">{cityEmoji(ev.city)} {ev.city}</span>}
        </div>
        <h1 className="detail-title">{ev.title}</h1>
        <div className="detail-cds">
          {ev.date ? (cd && !cd.past && <div className="detail-cd">{cd.text}</div>) : <div className="detail-cd"><CalendarClock size={13} /> Date à voter</div>}
          {!ev.place && modOn(ev, "placePoll") && <div className="detail-cd"><MapPinned size={13} /> Lieu à voter</div>}
        </div>
      </div>

      <div className="wrap">
        <div className="info-row"><CalendarDays size={18} /><div><b>{fmtRange(ev.date, ev.endDate)}</b>{timeLabel && <span className="soft"> · {timeLabel}</span>}</div></div>
        {ev.place && <div className="info-row"><MapPin size={18} /><div><b>{ev.place}</b></div></div>}

        {ev.description && <div className="detail-desc">{ev.description}</div>}

        <div className="rsvp-box">
          <div className="rsvp-q">Tu es chaud ?</div>
          <div className="rsvp-btns">
            {Object.entries(RS).map(([k, v]) => {
              const Icon = v.icon; const on = mine === k;
              return <button key={k} className={"rsvp" + (on ? " on" : "")} title={on ? "Reclique pour retirer ta réponse" : v.label} style={on ? { background: v.color, borderColor: v.color, color: "#fff" } : { color: v.color }} onClick={() => actions.rsvp(ev.id, k)}><Icon size={16} /> {v.label}</button>;
            })}
          </div>
          {mine && <p className="rsvp-undo">Reclique sur ta réponse pour la retirer.</p>}
        </div>

        {["in", "maybe", "out"].map((k) => groups[k].length > 0 && (
          <div className="people" key={k}>
            <div className="people-label" style={{ color: RS[k].color }}>{RS[k].label} · {groups[k].length}</div>
            {/* Le nom en entier : sur mobile une infobulle `title` ne s'ouvre
                jamais, des initiales seules ne disent donc rien à personne. */}
            <div className="avatars">{groups[k].map((n) => (
              <span className="person" key={n} style={{ borderColor: RS[k].color }}>
                <span className="person-ini" style={{ background: RS[k].color }}>{initials(nameOf(n))}</span>
                <span className="person-name">{nameOf(n)}{n === me && " (toi)"}</span>
              </span>
            ))}</div>
          </div>
        ))}

        {modOn(ev, "transport") && <Transport ev={ev} me={me} actions={actions} />}
        {modOn(ev, "hosting") && <Hosting ev={ev} me={me} actions={actions} />}
        {modOn(ev, "datePoll") && <DatePoll ev={ev} me={me} isCreator={isCreator} actions={actions} availability={availability} />}
        {modOn(ev, "placePoll") && <PlacePoll ev={ev} me={me} isCreator={isCreator} actions={actions} places={places} />}
        {modOn(ev, "todos") && <TodoList ev={ev} me={me} isCreator={isCreator} actions={actions} kind="todo" />}
        {modOn(ev, "courses") && <TodoList ev={ev} me={me} isCreator={isCreator} actions={actions} kind="course" />}

        {links.length > 0 && (
          <div className="links-box">
            <div className="links-title">Les liens du plan</div>
            {links.map((l, i) => {
              const k = LINK_KINDS[l.kind] || LINK_KINDS.other; const Icon = k.icon;
              return (
                <a key={i} className="link-btn" href={normUrl(l.url)} target="_blank" rel="noopener noreferrer" style={{ "--lc": k.color }}>
                  <span className="link-ic"><Icon size={18} /></span><span className="link-lbl">{l.label || k.label}</span><ExternalLink size={15} className="link-out" />
                </a>
              );
            })}
          </div>
        )}

        {modOn(ev, "comments") && <Comments ev={ev} me={me} actions={actions} />}

        {isCreator && <ModuleToggles ev={ev} actions={actions} />}
        <div className="detail-by">Créé par {nameOf(ev.createdBy)}</div>
        {isCreator && (confirmDel ? (
          <div className="del-confirm" role="alertdialog" aria-label="Confirmer la suppression">
            <p><AlertTriangle size={15} /> Supprimer «&nbsp;{ev.title}&nbsp;» ?</p>
            <p className="del-confirm-sub">Les réponses, commentaires et listes partiront avec. C&apos;est définitif.</p>
            <div className="del-confirm-acts">
              <button className="ghost-btn" onClick={() => setConfirmDel(false)}>Annuler</button>
              <button className="del-btn danger" onClick={() => actions.del(ev.id)}><Trash2 size={15} /> Oui, supprimer</button>
            </div>
          </div>
        ) : (
          <button className="del-btn" onClick={() => setConfirmDel(true)}><Trash2 size={15} /> Supprimer l&apos;event</button>
        ))}
      </div>
    </div>
  );
}

// ---------- qui y va comment ----------
function Transport({ ev, me, actions }) {
  const list = ev.transport || [];
  const mine = list.find((t) => t.by === me);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState(mine?.mode || "voiture");
  const [seats, setSeats] = useState(mine?.seats ? String(mine.seats) : "");
  const [at, setAt] = useState(mine?.at || "");
  const seatsOffered = list.filter((t) => t.mode === "voiture").reduce((s, t) => s + (Number(t.seats) || 0), 0);
  const seekers = list.filter((t) => t.mode === "covoit").length;
  const timeKind = TRANSPORT[mode]?.time;
  const save = () => {
    actions.setTransport(ev.id, {
      mode,
      seats: mode === "voiture" ? (Number(seats) || 0) : 0,
      at: timeKind ? at : "",
    });
    setEditing(false);
  };
  return (
    <section className="block">
      <div className="block-head"><Car size={17} /> Qui y va comment ?</div>
      {(seatsOffered > 0 || seekers > 0) && (
        <div className="tp-summary">
          {seatsOffered > 0 && <span>🚗 {seatsOffered} place{seatsOffered > 1 ? "s" : ""} offerte{seatsOffered > 1 ? "s" : ""}</span>}
          {seekers > 0 && <span>🙋 {seekers} cherche{seekers > 1 ? "nt" : ""} une place</span>}
        </div>
      )}
      {list.length === 0 && !editing && <p className="block-hint">Dis comment tu comptes t&apos;y rendre — pratique pour s&apos;organiser en covoiturage.</p>}
      {list.map((t) => {
        const m = TRANSPORT[t.mode] || TRANSPORT.autre; const Icon = m.icon;
        return (
          <div className="tprow" key={t.id}>
            <span className="tp-ic" style={{ background: m.color }}><Icon size={16} /></span>
            <div className="tp-info">
              <b>{nameOf(t.by)}</b> · {m.label}
              {t.mode === "voiture" && t.seats > 0 && <span className="soft"> ({t.seats} place{t.seats > 1 ? "s" : ""})</span>}
              {t.at && m.time && <span className="tp-at">{TIME_SHORT[m.time]} {t.at}</span>}
            </div>
          </div>
        );
      })}
      {editing ? (
        <div className="tp-edit">
          <div className="catpick">
            {Object.entries(TRANSPORT).map(([k, v]) => (
              <button key={k} type="button" className={"catchip" + (mode === k ? " on" : "")}
                style={mode === k ? { background: v.color, borderColor: v.color, color: "#fff" } : { color: v.color, borderColor: v.color + "55" }}
                onClick={() => setMode(k)}>{v.label}</button>
            ))}
          </div>
          {mode === "voiture" && <input className="tp-seats" type="number" min="0" value={seats} placeholder="Places dispo" onChange={(e) => setSeats(e.target.value)} />}
          {timeKind && (
            <label className="tp-time">
              <span>{TIME_LABEL[timeKind]} <em>(optionnel)</em></span>
              <input type="time" value={at} onChange={(e) => setAt(e.target.value)} />
            </label>
          )}
          <div className="tp-actions"><button className="btn-primary sm" onClick={save}>Enregistrer</button><button className="ghost-btn" onClick={() => setEditing(false)}>Annuler</button></div>
        </div>
      ) : (
        <div className="tp-cta">
          <button className="btn-soft" onClick={() => setEditing(true)}>{mine ? "Modifier mon trajet" : "Ajouter comment j'y vais"}</button>
          {mine && <button className="ghost-btn danger" onClick={() => actions.delTransport(ev.id)}>Retirer</button>}
        </div>
      )}
    </section>
  );
}

// ---------- sondage de lieu ----------
function PlacePoll({ ev, me, isCreator, actions, places }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const poll = [...(ev.placePoll || [])].sort((a, b) => b.votes.length - a.votes.length);
  const add = () => { if (!label.trim()) return; actions.addPlace(ev.id, label.trim(), url.trim()); setLabel(""); setUrl(""); };
  return (
    <section className="block">
      <div className="block-head"><MapPinned size={17} /> Sondage de lieu</div>
      {poll.length === 0 && <p className="block-hint">Proposez des endroits avec leur lien Maps, chacun vote. Le créateur fige le gagnant.</p>}
      {ev.place && poll.length > 0 && <p className="block-hint">Lieu fixé : {ev.place}. Vous pouvez proposer autre chose.</p>}
      {poll.map((o) => {
        const voted = o.votes.includes(me);
        return (
          <div className="pollrow" key={o.id}>
            <button className={"pollvote" + (voted ? " on" : "")} onClick={() => actions.votePlace(ev.id, o.id)}><Check size={14} /> {o.votes.length}</button>
            <div className="pollinfo">
              <b>{o.label}</b>
              {o.url && <a className="poll-maps" href={normUrl(o.url)} target="_blank" rel="noopener noreferrer"><MapIcon size={12} /> Voir sur Maps</a>}
              {o.votes.length > 0 && <div className="pollnames">{o.votes.map(nameOf).join(", ")}</div>}
            </div>
            {isCreator && <button className="polllock" onClick={() => actions.lockPlace(ev.id, o.id)} title="Figer ce lieu"><Lock size={14} /></button>}
            {(isCreator || (o.by ?? o.votes[0]) === me) && <button className="tododel" title="Retirer ce lieu" onClick={() => actions.delPlace(ev.id, o.id)}><X size={15} /></button>}
          </div>
        );
      })}
      <div className="placeadd">
        <PlaceInput value={label} onChange={setLabel} places={places} placeholder="Nom du lieu — Ex. Le Bibent" onEnter={add} />
        <div className="placeadd-row">
          <input value={url} placeholder="Lien Google Maps (optionnel)" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="addbtn" onClick={add} disabled={!label.trim()}><Plus size={18} /></button>
        </div>
      </div>
    </section>
  );
}

// ---------- hébergement ----------
function Hosting({ ev, me, actions }) {
  const list = ev.hosting || [];
  const mine = list.find((h) => h.by === me);
  const [editing, setEditing] = useState(false);
  const [seeking, setSeeking] = useState(mine?.seeking ?? false);
  const [spots, setSpots] = useState(mine?.spots ? String(mine.spots) : "");
  const offered = list.filter((h) => !h.seeking).reduce((n, h) => n + (Number(h.spots) || 0), 0);
  const seekers = list.filter((h) => h.seeking).length;
  const save = () => {
    actions.setHosting(ev.id, { seeking, spots: seeking ? 0 : (Number(spots) || 0) });
    setEditing(false);
  };
  return (
    <section className="block">
      <div className="block-head"><BedDouble size={17} /> Qui peut héberger ?</div>
      {(offered > 0 || seekers > 0) && (
        <div className="tp-summary">
          {offered > 0 && <span>🛏️ {offered} place{offered > 1 ? "s" : ""} proposée{offered > 1 ? "s" : ""}</span>}
          {seekers > 0 && <span>🙋 {seekers} cherche{seekers > 1 ? "nt" : ""} un lit</span>}
        </div>
      )}
      {list.length === 0 && !editing && <p className="block-hint">Dis si tu peux loger du monde, ou si tu cherches une place.</p>}
      {list.map((h) => (
        <div className="tprow" key={h.id}>
          <span className="tp-ic" style={{ background: h.seeking ? "#D97706" : "#0D9488" }}>
            {h.seeking ? <UserPlus size={16} /> : <BedDouble size={16} />}
          </span>
          <div className="tp-info">
            <b>{nameOf(h.by)}</b> · {h.seeking ? "Cherche un lit" : "Peut héberger"}
            {!h.seeking && h.spots > 0 && <span className="soft"> ({h.spots} place{h.spots > 1 ? "s" : ""})</span>}
          </div>
        </div>
      ))}
      {editing ? (
        <div className="tp-edit">
          <div className="catpick">
            <button type="button" className={"catchip" + (!seeking ? " on" : "")}
              style={!seeking ? { background: "#0D9488", borderColor: "#0D9488", color: "#fff" } : { color: "#0D9488", borderColor: "#0D948855" }}
              onClick={() => setSeeking(false)}>Je peux héberger</button>
            <button type="button" className={"catchip" + (seeking ? " on" : "")}
              style={seeking ? { background: "#D97706", borderColor: "#D97706", color: "#fff" } : { color: "#D97706", borderColor: "#D9770655" }}
              onClick={() => setSeeking(true)}>Je cherche un lit</button>
          </div>
          {!seeking && <input className="tp-seats" type="number" min="0" value={spots} placeholder="Places dispo" onChange={(e) => setSpots(e.target.value)} />}
          <div className="tp-actions"><button className="btn-primary sm" onClick={save}>Enregistrer</button><button className="ghost-btn" onClick={() => setEditing(false)}>Annuler</button></div>
        </div>
      ) : (
        <div className="tp-cta">
          <button className="btn-soft" onClick={() => setEditing(true)}>{mine ? "Modifier" : "Me positionner"}</button>
          {mine && <button className="ghost-btn danger" onClick={() => actions.delHosting(ev.id)}>Retirer</button>}
        </div>
      )}
    </section>
  );
}

// ---------- sondage de dates ----------
function DatePoll({ ev, me, isCreator, actions, availability }) {
  const isBig = (ev.scale || "daily") === "big";
  const [d, setD] = useState("");
  const [d2, setD2] = useState("");
  const poll = [...(ev.datePoll || [])].sort((a, b) => b.votes.length - a.votes.length);
  const badRange = Boolean(d && d2 && d2 < d);
  const add = () => {
    if (!d || badRange) return;
    actions.addDate(ev.id, d, isBig && d2 && d2 !== d ? d2 : "");
    setD(""); setD2("");
  };
  // Une indispo compte si elle recoupe le créneau, pas seulement son premier jour.
  const conflictsFor = (from, to) => {
    const last = to || from;
    return [...new Set((availability || [])
      .filter((a) => a.start <= last && (a.end || a.start) >= from)
      .map((a) => a.by))];
  };
  return (
    <section className="block">
      <div className="block-head"><CalendarClock size={17} /> Sondage de dates</div>
      {!ev.date && poll.length === 0 && <p className="block-hint">Pas encore de date. Proposez des créneaux, chacun vote pour ses dispos. Les indispos connues sont signalées.</p>}
      {ev.date && <p className="block-hint">Date fixée : {fmtRange(ev.date, ev.endDate)}. Vous pouvez proposer d&apos;autres créneaux.</p>}
      {poll.map((o) => {
        const voted = o.votes.includes(me);
        const conf = conflictsFor(o.date, o.endDate);
        return (
          <div className="pollrow" key={o.id}>
            <button className={"pollvote" + (voted ? " on" : "")} onClick={() => actions.voteDate(ev.id, o.id)}><Check size={14} /> {o.votes.length}</button>
            <div className="pollinfo">
              <span className="polldate">{pollRange(o.date, o.endDate)}</span>
              {o.votes.length > 0 && <div className="pollnames">{o.votes.map(nameOf).join(", ")}</div>}
              {conf.length > 0 && <div className="pollwarn"><AlertTriangle size={12} /> Indispo : {conf.map(nameOf).join(", ")}</div>}
            </div>
            {isCreator && <button className="polllock" onClick={() => actions.lockDate(ev.id, o.id)} title="Figer ce créneau"><Lock size={14} /></button>}
            {(isCreator || (o.by ?? o.votes[0]) === me) && <button className="tododel" title="Retirer ce créneau" onClick={() => actions.delDate(ev.id, o.id)}><X size={15} /></button>}
          </div>
        );
      })}
      <div className="polladd">
        <label className="polladd-f"><span>{isBig ? "Du" : "Date"}</span>
          <input type="date" value={d} onChange={(e) => {
            const v = e.target.value; setD(v);
            // Même raison que dans le formulaire : placer le calendrier de fin.
            if (v && (!d2 || d2 < v)) setD2(v);
          }} />
        </label>
        {isBig && (
          <label className="polladd-f"><span>Au</span>
            <input type="date" value={d2} min={d} onChange={(e) => setD2(e.target.value)} />
          </label>
        )}
        <button className="polladd-btn" onClick={add} disabled={!d || badRange}><Plus size={16} /></button>
      </div>
      {badRange && <p className="field-err" role="alert"><AlertTriangle size={14} /> La fin du créneau est avant son début.</p>}
    </section>
  );
}

// ---------- to-do / liste ----------
// Une seule mécanique, deux listes : les tâches et les courses ne se
// mélangent pas, mais se cochent pareil.
const LIST_KINDS = {
  todo:   { label: "To-Do",            icon: ListTodo,     hint: "Ce qu'il y a à faire — chacun peut cocher ce qu'il prend en charge.", ph: "Ex. Réserver l'Airbnb, appeler le resto…" },
  course: { label: "Liste de courses", icon: ShoppingCart, hint: "Ce qu'il faut acheter — chacun coche ce qu'il ramène.",             ph: "Ex. Charbon, salade, enceinte…" },
};

function TodoList({ ev, me, isCreator, actions, kind = "todo" }) {
  const [text, setText] = useState("");
  const conf = LIST_KINDS[kind];
  const Icon = conf.icon;
  const todos = (ev.todos || []).filter((t) => (t.kind || "todo") === kind);
  const add = () => { if (!text.trim()) return; actions.addTodo(ev.id, text.trim(), kind); setText(""); };
  return (
    <section className="block">
      <div className="block-head"><Icon size={17} /> {conf.label}</div>
      {todos.length === 0 && <p className="block-hint">{conf.hint}</p>}
      {todos.map((t) => (
        <div className={"todorow" + (t.done ? " done" : "")} key={t.id}>
          <button className="todocheck" onClick={() => actions.toggleTodo(ev.id, t.id)}>{t.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button>
          <div className="todotext"><span>{t.text}</span><small>{t.done ? `pris par ${nameOf(t.doneBy)}` : `ajouté par ${nameOf(t.by)}`}</small></div>
          {(t.by === me || isCreator) && <button className="tododel" onClick={() => actions.delTodo(ev.id, t.id)}><X size={15} /></button>}
        </div>
      ))}
      <div className="addrow">
        <input value={text} placeholder={conf.ph} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="addbtn" onClick={add} disabled={!text.trim()}><Plus size={18} /></button>
      </div>
    </section>
  );
}

// ---------- commentaires ----------
function Comments({ ev, me, actions }) {
  const [text, setText] = useState("");
  const list = ev.comments || [];
  const send = () => { if (!text.trim()) return; actions.addComment(ev.id, text.trim()); setText(""); };
  return (
    <section className="block">
      <div className="block-head"><MessageSquare size={17} /> Commentaires {list.length > 0 && <span className="cnt">{list.length}</span>}</div>
      {list.length === 0 && <p className="block-hint">Lancez la discussion sur ce plan.</p>}
      {list.map((c) => (
        <div className="cmt" key={c.id}>
          <span className="cmt-av">{c.by.slice(0, 2).toUpperCase()}</span>
          <div className="cmt-body">
            <div className="cmt-head"><b>{nameOf(c.by)}</b><span className="soft">{timeAgo(c.at)}</span>{c.by === me && <button className="cmt-del" onClick={() => actions.delComment(ev.id, c.id)}><X size={13} /></button>}</div>
            <p>{c.text}</p>
          </div>
        </div>
      ))}
      <div className="addrow">
        <input value={text} placeholder="Écris un message…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <button className="addbtn" onClick={send} disabled={!text.trim()}><Send size={17} /></button>
      </div>
    </section>
  );
}

// ---------- toggles de sections (créateur) ----------
function ModuleToggles({ ev, actions }) {
  const mods = ev.modules || (ev.scale === "big" ? MODULES_BIG : MODULES_DAILY);
  return (
    <div className="modrow">
      <div className="modrow-lbl">Sections affichées sur l'event (réglable par toi, créateur·rice)</div>
      <div className="catpick">
        {MODULE_LABELS.map(([k, l]) => {
          const on = mods[k] !== false;
          return <button key={k} type="button" className={"catchip mod" + (on ? " on" : "")} onClick={() => actions.setModule(ev.id, k, !on)}>{on ? <Check size={13} /> : <Plus size={13} />} {l}</button>;
        })}
      </div>
    </div>
  );
}

// ---------- onglet dispos ----------
// Conservé tel quel : onglet Dispos en pause. Rebranchable sans réécriture.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AvailabilityView({ availability, me, onAdd, onDel }) {
  const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [note, setNote] = useState("");
  const today = todayStr();
  const add = () => { if (!start) return; onAdd({ start, end: end && end >= start ? end : "", note: note.trim() }); setStart(""); setEnd(""); setNote(""); };
  const mine = availability.filter((a) => a.by === me).sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = availability.filter((a) => (a.end || a.start) >= today);
  const byPerson = {};
  upcoming.forEach((a) => { (byPerson[a.by] = byPerson[a.by] || []).push(a); });
  Object.values(byPerson).forEach((arr) => arr.sort((a, b) => a.start.localeCompare(b.start)));
  return (
    <div className="avail">
      <p className="avail-intro">Marque tes périodes d'indisponibilité. Elles apparaissent pour toute la bande et sont signalées dans les sondages de dates.</p>
      <div className="cal-hint"><CalendarPlus size={14} /> Bientôt : synchro Google Agenda pour remplir ça automatiquement.</div>
      <section className="block">
        <div className="block-head"><CalendarX size={17} /> Mes indispos</div>
        {mine.length === 0 && <p className="block-hint">Tu n'as rien marqué pour l'instant.</p>}
        {mine.map((a) => (
          <div className="availrow" key={a.id}>
            <div className="availrow-info"><b>{fmtRange(a.start, a.end)}</b>{a.note && <span className="soft"> · {a.note}</span>}</div>
            <button className="tododel" onClick={() => onDel(a.id)}><X size={15} /></button>
          </div>
        ))}
        <div className="avail-form">
          <div className="row2">
            <label className="field mini"><span>Du</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="field mini"><span>Au (optionnel)</span><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <div className="addrow">
            <input value={note} placeholder="Motif (optionnel) : vacances, taf…" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <button className="addbtn" onClick={add} disabled={!start}><Plus size={18} /></button>
          </div>
        </div>
      </section>
      <div className="section-label">Toute la bande</div>
      {Object.keys(byPerson).length === 0 ? (
        <Empty icon={<CalendarX size={26} />} title="Personne n'a marqué d'indispo" text="Dès qu'un pote note une absence à venir, elle s'affiche ici." />
      ) : (
        Object.entries(byPerson).map(([person, arr]) => (
          <div className="block" key={person}>
            <div className="block-head"><span className="cmt-av">{nameOf(person).slice(0, 2).toUpperCase()}</span> {nameOf(person)}</div>
            {arr.map((a) => (<div className="availrow" key={a.id}><div className="availrow-info"><b>{fmtRange(a.start, a.end)}</b>{a.note && <span className="soft"> · {a.note}</span>}</div></div>))}
          </div>
        ))
      )}
    </div>
  );
}


// ---------- form bits ----------
// Un <label> transmet tout clic reçu à son premier contrôle. Pour un champ
// unique c'est ce qu'on veut ; pour un groupe de boutons ça cochait le
// premier du lot dès qu'on cliquait à côté — d'où `group`, qui rend un div.
function Field({ label, children, hint, group }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="field" {...(group ? { role: "group", "aria-label": label } : {})}>
      <span>{label}</span>
      {children}
      {hint && <em className="field-hint">{hint}</em>}
    </Tag>
  );
}
function CatPicker({ value, onChange }) {
  return (
    <div className="catpick">
      {Object.entries(CATS).map(([k, v]) => (
        <button key={k} type="button" className={"catchip" + (value === k ? " on" : "")}
          style={value === k ? { background: v.color, borderColor: v.color, color: "#fff" } : { color: v.color, borderColor: v.color + "55" }}
          onClick={() => onChange(k)}>{v.emoji} {v.label}</button>
      ))}
    </div>
  );
}
// Montre, pendant la création, ce que les sections cochées donneront.
function ModulePreview({ modules, usePoll }) {
  const on = MODULE_LABELS.filter(([k]) => (k === "datePoll" ? usePoll || modules[k] : modules[k]));
  return (
    <div className="preview">
      <div className="preview-lbl">Ce que ton event affichera</div>
      {on.length === 0 ? (
        <p className="preview-empty">Aucune section — l&apos;event montrera juste son titre, sa date, son lieu et qui vient.</p>
      ) : on.map(([k]) => {
        const m = MODULE_META[k];
        const Icon = m.icon;
        return (
          <div className="preview-block" key={k}>
            <div className="preview-head"><Icon size={15} /> {m.title}</div>
            <p className="preview-hint">{m.hint}</p>
          </div>
        );
      })}
    </div>
  );
}

// Les champs date/heure natifs n'offrent aucun moyen de se vider sur mobile.
// Le bouton est placé SOUS le champ, jamais par-dessus : sur iOS le sélecteur
// natif capte tout toucher qui tombe dans sa surface, même au-dessus de lui.
function Clearable({ value, onClear, children }) {
  return (
    <div className="clearable">
      {children}
      {value && (
        <button type="button" className="clearbtn" onClick={onClear}>
          <X size={12} /> Effacer
        </button>
      )}
    </div>
  );
}

function CityPicker({ value, onChange }) {
  // Une ville hors des 5 habituelles bascule le champ libre en mode ouvert.
  const [free, setFree] = useState(Boolean(value) && !CITIES[value]);
  return (
    <>
      <div className="catpick">
        {CITY_LIST.map((c) => (
          <button key={c} type="button" className={"catchip city" + (value === c ? " on" : "")}
            onClick={() => { setFree(false); onChange(value === c ? "" : c); }}>{CITIES[c]} {c}</button>
        ))}
        <button type="button" className={"catchip city" + (free ? " on" : "")}
          onClick={() => { const next = !free; setFree(next); if (!next) onChange(""); else if (CITIES[value]) onChange(""); }}>
          📍 Autre…
        </button>
      </div>
      {free && (
        <input className="city-free" autoFocus value={CITIES[value] ? "" : value}
          placeholder="Ex. Lisbonne, Berlin, Biarritz…" onChange={(e) => onChange(e.target.value)} />
      )}
    </>
  );
}
function ScaleSeg({ value, onChange }) {
  return (
    <div className="seg inline">
      <button type="button" className={value === "big" ? "on" : ""} onClick={() => onChange("big")}><Sparkles size={15} /> Big event</button>
      <button type="button" className={value === "daily" ? "on" : ""} onClick={() => onChange("daily")}>Au quotidien</button>
    </div>
  );
}

function EventForm({ defScale, defCity, onClose, onSave, places }) {
  const [f, setF] = useState({
    title: "", category: "soiree", scale: defScale || "big", city: defCity || "",
    date: "", endDate: "", time: "", endTime: "", place: "", description: "",
    usePoll: false, tricount: "", messenger: "", airbnb: "",
    mapsLabel: "", mapsUrl: "", otherLabel: "", otherUrl: "",
    modules: { ...(defScale === "big" ? MODULES_BIG : MODULES_DAILY) },
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  /**
   * La date de début amorce celle de fin quand elle est vide ou devenue
   * antérieure. Sans ça, iOS ouvre le calendrier de fin sur le mois courant :
   * pour un ski en février 2027, il fallait faire défiler cinq mois.
   * `min` seul ne suffit pas, Safari ne s'en sert pas pour se positionner.
   */
  const setStart = (e) => {
    const v = e.target.value;
    setF((prev) => ({
      ...prev,
      date: v,
      endDate: v && (!prev.endDate || prev.endDate < v) ? v : prev.endDate,
    }));
  };
  const clear = (k) => () => setF({ ...f, [k]: "" });
  const isBig = f.scale === "big";

  // Une fin antérieure au début est refusée explicitement, plutôt que
  // silencieusement ignorée comme avant.
  const dateError = isBig && f.date && f.endDate && f.endDate < f.date
    ? "La date de fin est avant la date de début."
    : "";
  // Une heure de fin inférieure n'est pas une faute : la soirée déborde sur
  // le lendemain. On le signale sans bloquer.
  const overnight = !isBig && f.time && f.endTime && f.endTime < f.time;
  const invalid = Boolean(dateError);

  // quand on change de type, on réaligne les sections par défaut de ce type
  const switchScale = (s) => setF({ ...f, scale: s, modules: { ...(s === "big" ? MODULES_BIG : MODULES_DAILY), datePoll: f.usePoll || (s === "big" ? MODULES_BIG : MODULES_DAILY).datePoll } });

  const save = () => {
    const links = [];
    // Maps sert sur tous les events ; le reste reste propre aux big.
    if (f.mapsUrl.trim()) links.push({ kind: "maps", label: f.mapsLabel.trim() || "Google Maps", url: f.mapsUrl.trim() });
    if (isBig) {
      if (f.tricount.trim()) links.push({ kind: "tricount", label: "Tricount", url: f.tricount.trim() });
      if (f.messenger.trim()) links.push({ kind: "messenger", label: "Conv Messenger", url: f.messenger.trim() });
      if (f.airbnb.trim()) links.push({ kind: "airbnb", label: "Airbnb", url: f.airbnb.trim() });
      if (f.otherUrl.trim()) links.push({ kind: "other", label: f.otherLabel.trim() || "Lien", url: f.otherUrl.trim() });
    }
    // Une fin égale au début, c'est un event d'un jour : on ne la stocke pas.
    const endDate = isBig && f.endDate && f.endDate !== f.date ? f.endDate : "";
    const modules = { ...f.modules, datePoll: f.usePoll ? true : f.modules.datePoll };
    onSave({
      title: f.title.trim(), category: f.category, scale: f.scale, city: f.city,
      date: f.usePoll ? "" : f.date, endDate: f.usePoll ? "" : endDate,
      time: isBig || f.usePoll ? "" : f.time, endTime: isBig || f.usePoll ? "" : f.endTime,
      place: f.place.trim(), description: f.description.trim(), links, modules,
    });
  };

  return (
    <Modal title={isBig ? "Nouveau big event" : "Nouvel event quotidien"} onClose={onClose}>
      <Field group label="Nature de l'event"><ScaleSeg value={f.scale} onChange={switchScale} /></Field>
      <Field label="Ça s'appelle comment ?"><input value={f.title} onChange={set("title")} autoFocus placeholder={isBig ? "Ex. Nouvel An à Rome" : "Ex. Apéro du jeudi"} /></Field>
      <Field group label="Ville"><CityPicker value={f.city} onChange={(c) => setF({ ...f, city: c })} /></Field>
      <Field group label="Catégorie"><CatPicker value={f.category} onChange={(c) => setF({ ...f, category: c })} /></Field>

      {!f.usePoll && (isBig ? (
        <>
          <div className="row2">
            <Field group label="Date de début"><Clearable value={f.date} onClear={clear("date")}><input type="date" value={f.date} onChange={setStart} aria-label="Date de début" /></Clearable></Field>
            <Field group label="Date de fin"><Clearable value={f.endDate} onClear={clear("endDate")}><input type="date" value={f.endDate} min={f.date} onChange={set("endDate")} aria-label="Date de fin" /></Clearable></Field>
          </div>
          {dateError && <p className="field-err" role="alert"><AlertTriangle size={14} /> {dateError}</p>}
        </>
      ) : (
        <>
          <Field group label="Date"><Clearable value={f.date} onClear={clear("date")}><input type="date" value={f.date} onChange={set("date")} aria-label="Date" /></Clearable></Field>
          <div className="row2">
            <Field group label="Heure de début"><Clearable value={f.time} onClear={clear("time")}><input type="time" step="900" value={f.time} onChange={set("time")} aria-label="Heure de début" /></Clearable></Field>
            <Field group label="Heure de fin"><Clearable value={f.endTime} onClear={clear("endTime")}><input type="time" step="900" value={f.endTime} onChange={set("endTime")} aria-label="Heure de fin" /></Clearable></Field>
          </div>
          {overnight && <p className="field-note"><CalendarClock size={14} /> Cet event se termine le lendemain.</p>}
        </>
      ))}

      <label className="toggle-row">
        <input type="checkbox" checked={f.usePoll} onChange={(e) => setF({ ...f, usePoll: e.target.checked })} />
        <span><b>Pas encore de date ?</b> Lancer un sondage de dates à la place<em>Parfait pour un plan lointain — vous voterez le créneau ensuite.</em></span>
      </label>

      {/* group : dans un <label>, un clic sur une suggestion serait renvoyé
          au champ et rouvrirait la liste. */}
      <Field group label="Où ?">
        <PlaceInput value={f.place} onChange={(v) => setF({ ...f, place: v })} places={places}
          placeholder="Adresse, bar, lieu…" />
      </Field>
      <Field label="Détails (optionnel)"><textarea value={f.description} onChange={set("description")} rows={3} placeholder="Programme, ce qu'il faut ramener…" /></Field>

      <Field group label="Sections à activer" hint="Rien par défaut : coche ce dont tu as besoin, l'aperçu se remplit en dessous.">
        <div className="catpick">
          {MODULE_LABELS.map(([k, l]) => {
            const on = k === "datePoll" ? (f.usePoll || f.modules[k]) : f.modules[k];
            const locked = k === "datePoll" && f.usePoll;
            return <button key={k} type="button" disabled={locked} className={"catchip mod" + (on ? " on" : "") + (locked ? " locked" : "")}
              onClick={() => !locked && setF({ ...f, modules: { ...f.modules, [k]: !f.modules[k] } })}>{on ? <Check size={13} /> : <Plus size={13} />} {l}</button>;
          })}
        </div>
      </Field>

      <ModulePreview modules={f.modules} usePoll={f.usePoll} />

      <div className="links-form">
        <div className="links-form-head"><MapIcon size={14} /> Lien Google Maps</div>
        <div className="row2">
          <Field label="Comment l'appeler"><input value={f.mapsLabel} onChange={set("mapsLabel")} placeholder="Ex. Point de RDV, Le resto…" /></Field>
          <Field label="Lien Maps"><input value={f.mapsUrl} onChange={set("mapsUrl")} placeholder="maps.app.goo.gl/…" /></Field>
        </div>
      </div>

      {isBig && (
        <div className="links-form">
          <div className="links-form-head"><Sparkles size={14} /> Liens du plan <span>réservé aux big events</span></div>
          <Field label="Lien Tricount"><input value={f.tricount} onChange={set("tricount")} placeholder="tricount.com/…" /></Field>
          <Field label="Lien conv Messenger"><input value={f.messenger} onChange={set("messenger")} placeholder="m.me/… ou lien du groupe" /></Field>
          <Field label="Lien Airbnb"><input value={f.airbnb} onChange={set("airbnb")} placeholder="airbnb.fr/rooms/…" /></Field>
          <div className="row2">
            <Field label="Autre lien — nom"><input value={f.otherLabel} onChange={set("otherLabel")} placeholder="Ex. Playlist, billetterie…" /></Field>
            <Field label="Autre lien — URL"><input value={f.otherUrl} onChange={set("otherUrl")} placeholder="https://…" /></Field>
          </div>
        </div>
      )}

      <button className="btn-primary big" disabled={!f.title.trim() || !f.city || (!f.usePoll && !f.date) || invalid}
        onClick={save}>{!f.city ? "Choisis une ville"
          : (!f.usePoll && !f.date) ? "Choisis une date (ou un sondage)"
          : dateError ? "Corrige les dates"
          : "Créer l'event"}</button>
    </Modal>
  );
}


// ---------- shared UI ----------
function Modal({ title, children, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head"><h2>{title}</h2><button className="x" onClick={onClose}><X size={20} /></button></div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
function Empty({ icon, title, text }) { return <div className="empty"><div className="empty-ic">{icon}</div><h3>{title}</h3><p>{text}</p></div>; }


// ---------- styles ----------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap');
.root{--bg:#F4F2ED;--card:#FFFFFF;--ink:#211D2B;--muted:#726C7E;--line:#E6E2D8;--accent:#B4451F;--accent-soft:#FBEBE4;
  font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;min-height:100dvh;max-width:560px;margin:0 auto;position:relative;overflow-x:clip;-webkit-font-smoothing:antialiased;}
*{box-sizing:border-box;}
h1,h2,h3{font-family:'Bricolage Grotesque',sans-serif;margin:0;letter-spacing:-.02em;}
button{font-family:inherit;cursor:pointer;border:none;background:none;}
a{text-decoration:none;color:inherit;}
.wrap{padding:14px 18px calc(120px + env(safe-area-inset-bottom));}
.center{display:flex;justify-content:center;align-items:center;min-height:100vh;min-height:100dvh;}
.spinner{width:34px;height:34px;border:3px solid var(--accent-soft);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}

.onb{padding:52px 26px;display:flex;flex-direction:column;min-height:100vh;min-height:100dvh;justify-content:center;}
.onb-badge{width:64px;height:64px;border-radius:20px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 8px 24px -6px var(--accent);}
.onb-kicker{font-family:'Bricolage Grotesque';font-weight:800;letter-spacing:.14em;color:var(--accent);font-size:13px;margin-bottom:4px;}
.onb-title{font-size:40px;font-weight:800;line-height:1;}
.onb-sub{color:var(--muted);font-size:16px;margin:12px 0 32px;line-height:1.5;max-width:36ch;}
.onb-label{font-weight:600;font-size:14px;margin-bottom:8px;}
.onb-input{width:100%;padding:15px 16px;border:2px solid var(--line);border-radius:14px;font-size:17px;background:var(--card);outline:none;transition:border-color .15s;}
.onb-input:focus{border-color:var(--accent);}
.onb-note{color:var(--muted);font-size:12.5px;margin-top:14px;}

.hd{position:sticky;top:0;z-index:30;display:flex;justify-content:space-between;align-items:center;
  padding:calc(14px + env(safe-area-inset-top)) 18px 12px;gap:12px;
  background:var(--bg);border-bottom:1px solid transparent;}
/* Un filet apparaît dès que du contenu passe dessous. */
.hd.stuck{border-bottom-color:var(--line);box-shadow:0 6px 18px -14px rgba(20,17,28,.5);}
.hd-kicker{display:inline-flex;align-items:center;gap:6px;color:var(--accent);font-weight:700;font-size:15px;letter-spacing:-.01em;background:var(--accent-soft);padding:7px 14px;border-radius:20px;cursor:pointer;font-family:inherit;border:none;}
.hd-title-wrap{margin:0;min-width:0;}
.hd-kicker:active{transform:scale(.97);}
.hd-title{font-size:26px;font-weight:800;margin-top:9px;line-height:1.08;max-width:16ch;}
.hd-me{flex-shrink:0;width:42px;height:42px;border-radius:14px;background:var(--ink);color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;font-family:'Bricolage Grotesque';}
.hd-menu-wrap{position:relative;flex-shrink:0;}
.hd-backdrop{position:fixed;inset:0;z-index:40;}
.hd-menu{position:absolute;top:calc(100% + 8px);right:0;z-index:41;width:min(290px,calc(100vw - 36px));
  background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;
  box-shadow:0 18px 40px -12px rgba(20,17,28,.28);animation:up .16s cubic-bezier(.2,.8,.2,1);}
.hd-menu-me{font-family:'Bricolage Grotesque';font-weight:800;font-size:17px;margin-bottom:14px;}
.hd-menu-sec{font-weight:700;font-size:13.5px;margin-bottom:3px;}
.hd-menu-hint{color:var(--muted);font-size:12.5px;line-height:1.45;margin:0 0 10px;}
.hd-menu-cities{display:flex;flex-wrap:wrap;gap:6px;}
.hd-menu-inv{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);}
.inv-make,.inv-link{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;
  padding:11px;border-radius:12px;background:var(--accent);color:#fff;font-family:inherit;
  font-weight:600;font-size:14px;margin-top:8px;}
.inv-make:disabled{opacity:.55;}
.inv-link{background:var(--accent-soft);color:var(--accent);}
.hd-menu-prefs{display:flex;flex-direction:column;gap:2px;margin-top:10px;}
.pref{display:flex;align-items:center;gap:9px;padding:7px 2px;font-size:13px;font-weight:600;color:var(--muted);text-align:left;background:none;border:0;}
.pref.on{color:var(--ink);}
.pref-box{flex-shrink:0;width:19px;height:19px;border-radius:6px;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;color:#fff;}
.pref.on .pref-box{background:var(--accent);border-color:var(--accent);}
.pref-warn{margin:6px 0 0;}
.hd-menu-err{margin:8px 0 0;font-size:12px;line-height:1.45;color:#B91C1C;word-break:break-all;}
.hd-menu-out{margin-top:16px;padding-top:14px;border-top:1px solid var(--line);}
.hd-menu-out button{width:100%;padding:11px;border-radius:12px;background:var(--bg);
  font-family:inherit;font-weight:600;font-size:14px;color:var(--muted);}
.hd-menu-out button:hover{background:#EDEAE3;color:var(--ink);}

.tabs{display:flex;gap:6px;padding:0 18px 4px;}
.load-err{display:flex;align-items:center;gap:9px;margin:0 18px 10px;padding:11px 13px;border-radius:12px;
  background:#FDECEC;color:#B91C1C;font-size:13px;font-weight:600;line-height:1.4;}
.load-err span{flex:1;min-width:0;}
.load-err button{flex-shrink:0;padding:6px 11px;border-radius:9px;background:#B91C1C;color:#fff;
  font-family:inherit;font-weight:600;font-size:12.5px;}
.tab{display:flex;align-items:center;gap:6px;padding:9px 13px;border-radius:12px;font-weight:600;font-size:13.5px;color:var(--muted);transition:.15s;white-space:nowrap;}
.tab.on{background:var(--ink);color:#fff;}
.pill{background:var(--accent);color:#fff;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;}

.seg{display:flex;background:#E9E5DC;border-radius:13px;padding:4px;gap:4px;margin-bottom:12px;}
.seg button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:9px;font-weight:600;font-size:13.5px;color:var(--muted);transition:.15s;}
.seg button.on{background:var(--card);color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.08);}
.seg.inline{margin-bottom:0;}

.cities{display:flex;gap:7px;overflow-x:auto;padding:0 18px 14px;margin:0 -18px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.cities::-webkit-scrollbar{display:none;}
.citychip{position:relative;flex-shrink:0;padding:7px 13px;border-radius:20px;font-weight:600;font-size:13px;color:var(--ink);background:var(--card);border:1.5px solid var(--line);transition:.12s;white-space:nowrap;}
.citychip.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.dot{position:absolute;top:-3px;right:-3px;width:11px;height:11px;background:#EF4444;border-radius:50%;border:2.5px solid var(--bg);}
.dot.inline{position:static;display:inline-block;width:8px;height:8px;border:none;margin-left:1px;}

.card{display:flex;width:100%;text-align:left;background:var(--card);border-radius:16px;margin-bottom:9px;overflow:hidden;border:1px solid var(--line);transition:transform .12s,box-shadow .12s;}
.card:hover{transform:translateY(-2px);box-shadow:0 10px 26px -14px rgba(33,29,43,.4);}
.card:active{transform:translateY(0);}
.card.past{opacity:.66;}
.card-stripe{width:6px;background:var(--cat);flex-shrink:0;}
/* stretch : la colonne de droite occupe toute la hauteur de la carte,
   condition pour que le compteur puisse être poussé tout en bas. */
.card-body{padding:11px 14px;flex:1;min-width:0;display:flex;align-items:stretch;gap:12px;}
.card-main{flex:1;min-width:0;}
.card-main .tag{margin-bottom:6px;}
/* flex-shrink:0 : la colonne garde sa largeur, c'est le titre qui passe
   à la ligne — l'inverse tasserait « Toi : peut-être » en accordéon. */
/* space-between répartit les trois repères à intervalles égaux sur toute
   la hauteur : le compte à rebours en haut, le compteur en bas, ta
   réponse au milieu. Le gap ne sert plus que de distance minimale. */
.card-side{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;gap:6px;text-align:right;}
.tag{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;white-space:nowrap;}
.tag.sm{font-size:11.5px;padding:3px 9px;}
.tag.ghost{background:var(--bg);color:var(--muted);}
.tag.light{background:rgba(255,255,255,.22);color:#fff;}
.cd{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:3px 9px;border-radius:8px;font-family:'Bricolage Grotesque';}
.cd.hot{color:#fff;background:#DB2777;}
.cd.live{color:#fff;background:#0D9488;}
.cd.poll{color:#B45309;background:#FEF3C7;}
.card-title{font-size:17px;font-weight:700;line-height:1.2;}
.card-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 11px;margin:6px 0 0;color:var(--muted);font-size:12.5px;}
.card-meta span{display:inline-flex;align-items:center;gap:5px;}
.count{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:var(--ink);}
.mine{font-size:12.5px;font-weight:600;}
.section-label{font-size:12px;font-weight:600;color:var(--muted);margin:20px 4px 12px;}

.past-wrap{margin-top:18px;}
.past-toggle{display:flex;align-items:center;gap:7px;width:100%;padding:12px 15px;background:transparent;border:1.5px dashed var(--line);border-radius:14px;color:var(--muted);font-weight:600;font-size:13.5px;transition:.15s;}
.past-toggle:hover{border-color:var(--muted);}
.past-toggle svg{transition:transform .2s;}
.past-toggle.open{margin-bottom:12px;}
.past-toggle.open svg{transform:rotate(180deg);}

/* La fiche vit désormais sous le header : elle ne doit plus réclamer
   toute la hauteur de l'écran, sinon la page dépasse d'autant. */
.detail{min-height:auto;}
.detail-hero{padding:16px 18px 30px;color:#fff;border-radius:0 0 26px 26px;}
.detail-emoji{font-size:44px;margin:16px 0 10px;}
.detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
.ghost-btn{display:inline-flex;align-items:center;gap:4px;font-weight:600;font-size:14px;padding:7px 12px 7px 8px;border-radius:10px;color:var(--muted);}
.ghost-btn.light{background:rgba(255,255,255,.18);color:#fff;}
.ghost-btn.danger{color:#DC2626;}
.detail-title{font-size:29px;font-weight:800;line-height:1.05;}
.detail-cds{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;}
.detail-cd{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.22);font-family:'Bricolage Grotesque';font-weight:700;padding:6px 14px;border-radius:12px;font-size:15px;}
.info-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);color:var(--accent);}
.info-row div{color:var(--ink);font-size:15px;}
.info-row .soft{color:var(--muted);font-weight:400;}
.detail-desc{margin:18px 0;padding:14px 16px;border-left:3px solid var(--accent);background:var(--card);border-radius:0 14px 14px 0;line-height:1.6;color:var(--ink);font-size:16.5px;white-space:pre-wrap;}

.detail-top{display:flex;align-items:center;justify-content:space-between;gap:10px;}
/* Dans le bandeau coloré : aligné à droite, sous le bouton Partager. */
.cal-block{margin-top:12px;display:flex;flex-direction:column;align-items:flex-end;gap:7px;}
.cal-btn.light{border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.14);color:#fff;flex:0 0 auto;}
.cal-btn.light:hover{background:rgba(255,255,255,.26);border-color:rgba(255,255,255,.7);color:#fff;}
.cal-label{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12px;opacity:.9;}
.cal-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
.cal-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:8px 12px;border-radius:11px;border:1.5px solid var(--line);background:var(--card);font-weight:600;font-size:12.5px;color:var(--ink);transition:.12s;}
.cal-btn:hover{border-color:var(--accent);color:var(--accent);}
.cal-hint{display:flex;align-items:center;gap:7px;background:var(--accent-soft);color:var(--accent);font-size:12.5px;font-weight:600;padding:9px 12px;border-radius:12px;margin-bottom:16px;}

.links-box{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;margin:18px 0;}
.links-title{font-family:'Bricolage Grotesque';font-weight:700;font-size:15px;margin-bottom:11px;}
.link-btn{display:flex;align-items:center;gap:11px;padding:12px;border-radius:13px;border:1.5px solid var(--line);margin-bottom:9px;transition:.12s;}
.link-btn:last-child{margin-bottom:0;}
.link-btn:hover{border-color:var(--lc);background:#fafafa;}
.link-ic{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;background:var(--lc);flex-shrink:0;}
.link-lbl{flex:1;font-weight:600;font-size:14.5px;}
.link-out{color:var(--muted);}

.rsvp-box{background:var(--card);border:2px solid var(--accent);border-radius:18px;padding:18px;margin:18px 0;box-shadow:0 8px 24px -14px var(--accent);}
.rsvp-q{font-weight:800;font-family:'Bricolage Grotesque';font-size:21px;letter-spacing:-.02em;margin-bottom:14px;color:var(--ink);}
.rsvp-btns{display:flex;gap:8px;}
.rsvp-undo{color:var(--muted);font-size:12.5px;margin:11px 0 0;}
.rsvp{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 4px;border:2px solid var(--line);border-radius:13px;font-weight:600;font-size:12.5px;transition:.15s;background:var(--card);}
.people{margin:16px 0;}
.people-label{font-weight:700;font-size:13.5px;font-family:'Bricolage Grotesque';margin-bottom:9px;}
.avatars{display:flex;flex-wrap:wrap;gap:7px;}
.person{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:4px 12px 4px 4px;border-radius:22px;background:var(--card);border:2px solid;}
.person-ini{flex-shrink:0;width:27px;height:27px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;font-family:'Bricolage Grotesque';color:#fff;}
/* anywhere : un blaze d'un seul tenant se coupe plutôt que de déborder. */
.person-name{font-weight:600;font-size:13.5px;color:var(--ink);overflow-wrap:anywhere;}

.block{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:15px;margin:14px 0;}
.block-head{display:flex;align-items:center;gap:8px;font-family:'Bricolage Grotesque';font-weight:700;font-size:16px;color:var(--ink);margin-bottom:12px;}
.block-head .cnt{background:var(--accent-soft);color:var(--accent);font-size:12px;padding:1px 8px;border-radius:10px;font-family:'Inter';}
.block-hint{color:var(--muted);font-size:13.5px;line-height:1.45;margin-bottom:12px;}

.tp-summary{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}
.tp-summary span{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:5px 10px;font-size:12.5px;font-weight:600;}
.tprow{display:flex;align-items:flex-start;gap:11px;padding:9px 0;border-bottom:1px solid var(--line);}
.tp-ic{width:32px;height:32px;border-radius:9px;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.tp-info{font-size:14px;padding-top:4px;}
.tp-note{color:var(--muted);font-size:12.5px;margin-top:2px;}
.tp-edit{margin-top:12px;}
.tp-seats,.tp-noteinput{width:100%;padding:11px 13px;border:2px solid var(--line);border-radius:12px;font-size:16px;background:var(--bg);outline:none;font-family:inherit;margin-top:10px;}
.tp-seats:focus,.tp-noteinput:focus{border-color:var(--accent);}
.tp-actions{display:flex;align-items:center;gap:10px;margin-top:12px;}
.tp-cta{display:flex;align-items:center;gap:10px;margin-top:12px;}
.btn-soft{background:var(--accent-soft);color:var(--accent);font-weight:600;font-size:14px;padding:10px 16px;border-radius:12px;}

.pollrow{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);}
.pollvote{display:flex;align-items:center;gap:5px;flex-shrink:0;padding:7px 11px;border:2px solid var(--line);border-radius:11px;font-weight:700;font-size:13px;color:var(--muted);transition:.12s;}
.pollvote.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);}
.pollinfo{flex:1;min-width:0;font-size:14px;text-transform:capitalize;padding-top:3px;}
.pollnames{color:var(--muted);font-size:12px;text-transform:none;margin-top:2px;}
.pollwarn{display:flex;align-items:center;gap:4px;color:#D97706;font-size:12px;text-transform:none;margin-top:3px;font-weight:600;}
.polllock{flex-shrink:0;width:34px;height:34px;border-radius:10px;background:var(--bg);color:var(--muted);display:flex;align-items:center;justify-content:center;border:1px solid var(--line);}
.polladd{display:flex;align-items:flex-end;gap:8px;margin-top:12px;}
.polladd-f{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;}
.polladd-f span{font-size:12px;font-weight:600;color:var(--muted);}
/* Même neutralisation que dans le formulaire : le contrôle natif iOS
   impose sinon une largeur qui fait déborder la rangée. */
.polladd-f input{flex:none;width:100%;min-width:0;-webkit-appearance:none;appearance:none;}
.polladd-f input::-webkit-date-and-time-value{min-width:0;width:100%;text-align:left;margin:0;}
.tp-at{display:block;font-size:12.5px;color:var(--muted);margin-top:2px;}
.tp-time{display:flex;flex-direction:column;gap:6px;margin-top:8px;font-size:13.5px;font-weight:600;}
.tp-time em{font-style:normal;font-weight:400;color:var(--muted);}
.tp-time input{padding:11px 13px;border:2px solid var(--line);border-radius:12px;font-size:16px;font-family:inherit;background:var(--card);color:var(--ink);}
/* Autocomplétion des lieux : la liste se superpose au reste du formulaire,
   d'où le position:relative sur le conteneur et le z-index sur la liste. */
.ac{position:relative;}
.ac-list{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:20;background:var(--card);border:1.5px solid var(--line);border-radius:12px;box-shadow:0 10px 26px rgba(0,0,0,.13);overflow:hidden;}
.ac-item{display:flex;align-items:center;gap:8px;width:100%;padding:11px 13px;font-size:13.5px;font-weight:600;color:var(--ink);text-align:left;background:none;border:0;border-bottom:1px solid var(--line);}
.ac-item:last-child{border-bottom:0;}
.ac-item:hover{background:var(--bg);color:var(--accent);}
.placeadd{display:flex;flex-direction:column;gap:8px;margin-top:12px;}
.placeadd-row{display:flex;gap:8px;}
.placeadd input{flex:1;min-width:0;padding:11px 13px;border:2px solid var(--line);border-radius:12px;font-size:16px;font-family:inherit;background:var(--card);color:var(--ink);}
/* La date porte la ligne sans l'écraser : un gras plein sur chaque
   créneau rendait la liste illisible dès trois propositions. */
.polldate{display:block;font-weight:600;letter-spacing:-.1px;}
/* Le lien Maps est une cible tactile à part : il descend sous le nom du lieu
   et prend une pastille, pour ne pas se confondre avec lui. */
.poll-maps{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;
  color:#1A73E8;background:#E8F0FE;padding:5px 10px;border-radius:9px;margin-top:9px;
  text-transform:none;}
.poll-maps:hover{background:#D6E4FC;}
.city-free{width:100%;margin-top:8px;padding:12px 14px;border:2px solid var(--accent);border-radius:12px;font-size:16px;font-family:inherit;background:var(--card);color:var(--ink);outline:none;}
.polladd input{flex:1;min-width:0;padding:10px;border:2px solid var(--line);border-radius:11px;font-size:16px;background:var(--bg);outline:none;font-family:inherit;}
.polladd input:focus{border-color:var(--accent);}
.polladd-btn{flex-shrink:0;width:42px;border-radius:11px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;}
.polladd-btn:disabled{opacity:.4;}

.todorow{display:flex;align-items:center;gap:11px;padding:9px 0;border-bottom:1px solid var(--line);}
.todocheck{color:var(--muted);display:flex;flex-shrink:0;}
.todorow.done .todocheck{color:#0D9488;}
.todotext{flex:1;min-width:0;}
.todotext span{font-size:14.5px;display:block;}
.todorow.done .todotext span{text-decoration:line-through;color:var(--muted);}
.todotext small{color:var(--muted);font-size:11.5px;}
.tododel{flex-shrink:0;color:var(--muted);width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;}

.addrow{display:flex;gap:8px;margin-top:12px;}
.addrow input{flex:1;min-width:0;padding:11px 13px;border:2px solid var(--line);border-radius:12px;font-size:16px;background:var(--bg);outline:none;font-family:inherit;}
.addrow input:focus{border-color:var(--accent);}
.addbtn{flex-shrink:0;width:44px;border-radius:12px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;}
.addbtn:disabled{opacity:.4;}

.cmt{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);}
.cmt-av{flex-shrink:0;width:34px;height:34px;border-radius:10px;background:var(--accent-soft);color:var(--accent);font-weight:700;font-size:12px;font-family:'Bricolage Grotesque';display:flex;align-items:center;justify-content:center;}
.cmt-body{flex:1;min-width:0;}
.cmt-head{display:flex;align-items:center;gap:8px;margin-bottom:2px;}
.cmt-head b{font-size:13.5px;}
.cmt-head .soft{font-size:11.5px;}
.cmt-del{margin-left:auto;color:var(--muted);display:flex;}
.cmt-body p{font-size:14px;line-height:1.45;color:#443E52;word-break:break-word;}

.modrow{margin:22px 0 6px;padding:14px;border:1.5px dashed var(--line);border-radius:16px;background:#FBFAF7;}
.modrow-lbl{font-size:12.5px;color:var(--muted);margin-bottom:10px;font-weight:600;}
.catchip.mod{color:var(--muted);border-color:var(--line);display:inline-flex;align-items:center;gap:5px;}
.catchip.mod.on{background:var(--accent);color:#fff;border-color:var(--accent);}
.catchip.mod.locked{opacity:.55;cursor:not-allowed;}

.avail-intro{color:var(--muted);font-size:14px;line-height:1.5;margin:4px 4px 12px;}
.availrow{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);}
.availrow-info{flex:1;font-size:14px;}
.avail-form{margin-top:12px;}
.field.mini>span{font-size:12px;margin-bottom:5px;}
.field.mini input{padding:10px 12px;font-size:16px;}

.detail-by{color:var(--muted);font-size:13px;margin:22px 0 10px;}
.del-btn{display:inline-flex;align-items:center;gap:7px;color:#DC2626;font-weight:600;font-size:14px;padding:10px 14px;border-radius:11px;border:1px solid #FCA5A5;background:#FEF2F2;}
.del-confirm{background:#FDECEC;border:1.5px solid #F3C6C6;border-radius:16px;padding:15px;margin-top:14px;}
.del-confirm p{display:flex;align-items:center;gap:7px;margin:0;font-weight:700;font-size:14.5px;color:#B91C1C;}
.del-confirm-sub{display:block!important;margin-top:6px!important;font-weight:400!important;font-size:13px!important;color:#8A3B3B!important;line-height:1.45;}
.del-confirm-acts{display:flex;gap:10px;margin-top:14px;}
.del-confirm-acts .ghost-btn{flex:1;padding:11px;border-radius:12px;background:var(--card);font-weight:600;}
.del-btn.danger{flex:1;margin-top:0;justify-content:center;background:#B91C1C;color:#fff;}

.prop{display:flex;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:11px;}
.vote{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;width:52px;padding:9px 0;border:2px solid var(--line);border-radius:13px;color:var(--muted);font-family:'Bricolage Grotesque';transition:.15s;}
.vote b{font-size:16px;}
.vote.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);}
.prop-body{flex:1;min-width:0;}
.prop-tags{display:flex;flex-wrap:wrap;gap:6px;}
.prop-title{font-size:17px;font-weight:700;margin:8px 0 6px;line-height:1.2;}
.prop-note{color:#443E52;font-size:14px;line-height:1.5;margin-bottom:10px;}
.prop-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;}
.soft{color:var(--muted);font-size:13px;}
.promote{display:inline-flex;align-items:center;gap:5px;color:var(--accent);font-weight:600;font-size:13px;background:var(--accent-soft);padding:6px 11px;border-radius:10px;}

.fab{position:fixed;bottom:calc(22px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:var(--accent);color:#fff;font-weight:700;font-size:15px;padding:14px 22px;border-radius:30px;box-shadow:0 10px 30px -6px var(--accent);z-index:20;font-family:'Bricolage Grotesque';white-space:nowrap;}
.fab:active{transform:translateX(-50%) scale(.97);}

.empty{text-align:center;padding:54px 30px;}
.empty-ic{width:60px;height:60px;border-radius:18px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;}
.empty h3{font-size:20px;font-weight:700;margin-bottom:8px;}
.empty p{color:var(--muted);line-height:1.5;max-width:32ch;margin:0 auto;font-size:14.5px;}

.overlay{position:fixed;inset:0;background:rgba(20,17,28,.5);display:flex;align-items:flex-end;justify-content:center;z-index:50;animation:fade .2s;}
.sheet{background:var(--bg);width:100%;max-width:560px;border-radius:24px 24px 0 0;max-height:92vh;max-height:92dvh;overflow-y:auto;overflow-x:hidden;animation:up .25s cubic-bezier(.2,.8,.2,1);}
@keyframes fade{from{opacity:0;}}
@keyframes up{from{transform:translateY(30px);}}
.sheet-head{display:flex;justify-content:space-between;align-items:center;padding:20px 20px 6px;position:sticky;top:0;background:var(--bg);z-index:2;}
.sheet-head h2{font-size:22px;font-weight:800;}
.x{width:36px;height:36px;border-radius:50%;background:var(--card);display:flex;align-items:center;justify-content:center;color:var(--muted);border:1px solid var(--line);}
.sheet-body{padding:12px 20px calc(30px + env(safe-area-inset-bottom));min-width:0;}
.field{display:block;margin-bottom:16px;}
.field>span{display:block;font-weight:600;font-size:13.5px;margin-bottom:7px;}
.field-hint{display:block;color:var(--muted);font-size:12px;font-style:normal;margin-top:6px;}
.field-err{display:flex;align-items:center;gap:6px;margin:-6px 0 16px;padding:9px 12px;
  border-radius:10px;background:#FDECEC;color:#B91C1C;font-size:13px;font-weight:600;line-height:1.4;}
.field-note{display:flex;align-items:center;gap:6px;margin:-6px 0 16px;padding:9px 12px;
  border-radius:10px;background:var(--accent-soft);color:var(--accent);font-size:13px;font-weight:600;line-height:1.4;}
.field input,.field textarea{width:100%;padding:13px 14px;border:2px solid var(--line);border-radius:12px;font-size:16px;background:var(--card);outline:none;font-family:inherit;transition:border-color .15s;}
.field input:focus,.field textarea:focus{border-color:var(--accent);}
.field textarea{resize:vertical;}
.row2{display:flex;gap:12px;}
.row2 .field{flex:1;min-width:0;}

/* Sur iOS, input[type=date|time] refuse de descendre sous une largeur
   imposée par son contrôle natif — min-width:0 sur l'input n'y suffit pas.
   Il faut retirer l'habillage système ET relâcher le pseudo-élément qui
   porte la valeur, qui a son propre plancher. */
.field input[type="date"],.field input[type="time"]{
  -webkit-appearance:none;appearance:none;min-width:0;width:100%;padding-left:11px;padding-right:11px;}
.field input[type="date"]::-webkit-date-and-time-value,
.field input[type="time"]::-webkit-date-and-time-value{
  min-width:0;width:100%;text-align:left;margin:0;}
.field input[type="date"]::-webkit-calendar-picker-indicator,
.field input[type="time"]::-webkit-calendar-picker-indicator{margin:0;padding:0;}
.field input,.field textarea{min-width:0;max-width:100%;}
.clearable{display:flex;flex-direction:column;align-items:flex-start;gap:6px;}
.clearable input{width:100%;}
.clearbtn{display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border-radius:8px;
  background:var(--bg);color:var(--muted);font-family:inherit;font-size:12.5px;font-weight:600;}
.clearbtn:active,.clearbtn:hover{background:#EDEAE3;color:var(--ink);}
.preview{border:2px dashed var(--line);border-radius:16px;padding:14px;margin-bottom:16px;background:var(--bg);}
.preview-lbl{font-family:'Bricolage Grotesque';font-weight:700;font-size:12.5px;letter-spacing:.06em;
  text-transform:uppercase;color:var(--muted);margin-bottom:10px;}
.preview-empty{color:var(--muted);font-size:13px;line-height:1.5;margin:0;}
.preview-block{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:11px 13px;margin-bottom:8px;}
.preview-block:last-child{margin-bottom:0;}
.preview-head{display:flex;align-items:center;gap:7px;font-family:'Bricolage Grotesque';font-weight:700;font-size:14.5px;}
.preview-hint{color:var(--muted);font-size:12.5px;line-height:1.45;margin:4px 0 0;}
.toggle-row{display:flex;align-items:flex-start;gap:11px;padding:14px;background:var(--accent-soft);border-radius:14px;margin-bottom:16px;cursor:pointer;}
.toggle-row input{width:20px;height:20px;margin-top:1px;flex-shrink:0;accent-color:var(--accent);}
.toggle-row span{font-size:14px;line-height:1.4;}
.toggle-row em{display:block;color:var(--muted);font-size:12.5px;font-style:normal;margin-top:3px;}
.catpick{display:flex;flex-wrap:wrap;gap:7px;}
.catchip{padding:8px 13px;border:2px solid;border-radius:20px;font-weight:600;font-size:13px;background:var(--card);transition:.12s;}
.catchip.city{color:var(--ink);border-color:var(--line);}
.catchip.city.on{background:var(--ink);color:#fff;border-color:var(--ink);}
.links-form{background:#F0EBFA;border:1.5px dashed #C9B8F0;border-radius:16px;padding:14px 14px 2px;margin-bottom:18px;}
.links-form-head{display:flex;align-items:center;gap:6px;font-family:'Bricolage Grotesque';font-weight:700;font-size:14px;color:var(--accent);margin-bottom:12px;}
.links-form-head span{font-family:'Inter';font-weight:500;font-size:12px;color:var(--muted);margin-left:auto;}
.btn-primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);color:#fff;font-weight:700;border-radius:14px;font-family:'Bricolage Grotesque';transition:.15s;}
.btn-primary:disabled{opacity:.4;cursor:not-allowed;}
.btn-primary.big{width:100%;padding:15px;font-size:16px;margin-top:6px;}
.btn-primary.sm{padding:10px 18px;font-size:14px;}
.btn-primary:not(:disabled):active{transform:scale(.98);}
`;

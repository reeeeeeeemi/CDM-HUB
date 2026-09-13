"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus, Users, CalendarDays, Lightbulb, MapPin, ChevronLeft, ChevronDown, Check, HelpCircle,
  X, Trash2, ArrowUp, Sparkles, Send, PartyPopper, Wallet, MessageCircle, Link2,
  ExternalLink, MessageSquare, ListTodo, CheckCircle2, Circle, CalendarClock, Lock,
  Car, Plane, TrainFront, UserPlus, Navigation, CalendarX, AlertTriangle, CalendarPlus,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  HUB Events CDM — prototype
 *  NOTE backend (Supabase) : notifications push quand un event est créé
 *  dans une ville suivie / en global ; synchro Google Calendar (OAuth)
 *  pour remplir les Dispos via free/busy. Apple = pas d'API propre.
 * ------------------------------------------------------------------ */

// ---------- stockage ----------
const memory = new Map();
const hasStore = typeof window !== "undefined" && window.storage;
async function sget(key, shared) {
  try {
    if (hasStore) { const r = await window.storage.get(key, shared); return r ? JSON.parse(r.value) : null; }
    return memory.has(key) ? JSON.parse(memory.get(key)) : null;
  } catch { return null; }
}
async function sset(key, value, shared) {
  try { const v = JSON.stringify(value); if (hasStore) await window.storage.set(key, v, shared); else memory.set(key, v); }
  catch (e) { console.error("storage set failed", e); }
}

// ---------- config ----------
const CATS = {
  soiree:  { label: "Soirée",      color: "#7C3AED", emoji: "🎉" },
  sport:   { label: "Sport",       color: "#0D9488", emoji: "⚽" },
  resto:   { label: "Resto",       color: "#EA580C", emoji: "🍽️" },
  picnic:  { label: "Pique-nique", color: "#65A30D", emoji: "🧺" },
  voyage:  { label: "Voyage",      color: "#2563EB", emoji: "✈️" },
  chill:   { label: "Chill",       color: "#DB2777", emoji: "🛋️" },
  autre:   { label: "Autre",       color: "#64748B", emoji: "📌" },
};
const CITIES = { Toulouse: "🌸", Bordeaux: "🍷", Paris: "🗼", Casablanca: "🕌", Rome: "🏛️" };
const CITY_LIST = Object.keys(CITIES);
const TRANSPORT = {
  voiture: { label: "Je conduis",        icon: Car,        color: "#0D9488", driver: true },
  covoit:  { label: "Cherche une place", icon: UserPlus,   color: "#D97706", seeker: true },
  train:   { label: "En train",          icon: TrainFront, color: "#2563EB" },
  avion:   { label: "En avion",          icon: Plane,      color: "#7C3AED" },
  autre:   { label: "Par mes moyens",    icon: Navigation, color: "#64748B" },
};
// modules par défaut selon le type d'event
const MODULES_BIG   = { transport: true,  datePoll: true,  todos: true,  comments: true };
const MODULES_DAILY = { transport: false, datePoll: false, todos: true,  comments: true };
const MODULE_LABELS = [
  ["transport", "Qui y va comment"],
  ["datePoll", "Sondage de dates"],
  ["todos", "Liste de courses"],
  ["comments", "Commentaires"],
];

const uid = () => Math.random().toString(36).slice(2, 9);
const normUrl = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : "https://" + u);
const todayStr = () => new Date().toISOString().slice(0, 10);

function fmtDate(d) {
  if (!d) return "Date à définir";
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}
const shortDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
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
  other:     { label: "Lien",      icon: Link2,         color: "#6D28D9" },
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
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HUB Events CDM//FR", "BEGIN:VEVENT",
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

// ---------- app ----------
/**
 * `me` vient du compte connecté (voir app/page.tsx). Quand il est fourni,
 * l'écran Onboarding ne s'affiche plus : l'identité est déjà connue.
 *
 * @param {{ me?: string | null, onSignOut?: (() => void | Promise<void>) | null }} props
 */
export default function App({ me: meFromAuth = null, onSignOut = null }) {
  const [me, setMe] = useState(meFromAuth);
  const [tab, setTab] = useState("events");
  const [scale, setScale] = useState("big");
  const [city, setCity] = useState("all");
  const [events, setEvents] = useState([]);
  const [proposals, setProposals] = useState([]);
  const [availability, setAvailability] = useState([]);
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newCities, setNewCities] = useState(new Set());

  useEffect(() => {
    (async () => {
      const savedMe = meFromAuth ?? (await sget("cdm:me", false));
      if (savedMe) setMe(savedMe);
      let evs = await sget("cdm:events", true);
      let avail = await sget("cdm:availability", true);
      const seeded = await sget("cdm:seeded", true);
      if (!seeded) {
        evs = seedEvents(); avail = seedAvail();
        await sset("cdm:events", evs, true);
        await sset("cdm:availability", avail, true);
        await sset("cdm:seeded", true, true);
      }
      setEvents(evs || []);
      setAvailability(avail || []);
      setProposals((await sget("cdm:proposals", true)) || []);
      const lastSeen = await sget("cdm:lastSeen", false);
      if (savedMe && lastSeen) {
        const nc = new Set((evs || []).filter((e) => (e.createdAt || 0) > lastSeen && e.createdBy !== savedMe && e.city).map((e) => e.city));
        setNewCities(nc);
      }
      await sset("cdm:lastSeen", Date.now(), false);
      setLoading(false);
    })();
  }, [meFromAuth]);

  const saveEvents = useCallback(async (n) => { setEvents(n); await sset("cdm:events", n, true); }, []);
  const saveProposals = useCallback(async (n) => { setProposals(n); await sset("cdm:proposals", n, true); }, []);
  const saveAvail = useCallback(async (n) => { setAvailability(n); await sset("cdm:availability", n, true); }, []);
  const pickName = async (name) => { setMe(name); await sset("cdm:me", name, false); };

  const updateEvent = useCallback((id, updater) => {
    setEvents((prev) => { const next = prev.map((e) => (e.id === id ? updater(e) : e)); sset("cdm:events", next, true); return next; });
  }, []);

  const addEvent = async (e) => {
    await saveEvents([{ ...e, id: uid(), createdBy: me, createdAt: Date.now(), rsvps: { [me]: "in" }, comments: [], todos: [], datePoll: [], transport: [] }, ...events]);
    setModal(null);
  };
  const delEvent = async (id) => { await saveEvents(events.filter((e) => e.id !== id)); setSelected(null); };

  const actions = useMemo(() => ({
    rsvp: (id, s) => updateEvent(id, (e) => ({ ...e, rsvps: { ...e.rsvps, [me]: s } })),
    del: delEvent,
    setModule: (id, key, val) => updateEvent(id, (e) => ({ ...e, modules: { ...(e.modules || (e.scale === "big" ? MODULES_BIG : MODULES_DAILY)), [key]: val } })),
    addComment: (id, text) => updateEvent(id, (e) => ({ ...e, comments: [...(e.comments || []), { id: uid(), by: me, text, at: Date.now() }] })),
    delComment: (id, cid) => updateEvent(id, (e) => ({ ...e, comments: (e.comments || []).filter((c) => c.id !== cid) })),
    addTodo: (id, text) => updateEvent(id, (e) => ({ ...e, todos: [...(e.todos || []), { id: uid(), text, by: me, done: false }] })),
    toggleTodo: (id, tid) => updateEvent(id, (e) => ({ ...e, todos: (e.todos || []).map((t) => t.id === tid ? { ...t, done: !t.done, doneBy: !t.done ? me : null } : t) })),
    delTodo: (id, tid) => updateEvent(id, (e) => ({ ...e, todos: (e.todos || []).filter((t) => t.id !== tid) })),
    addDate: (id, date, time) => updateEvent(id, (e) => ({ ...e, datePoll: [...(e.datePoll || []), { id: uid(), date, time, votes: [me] }] })),
    voteDate: (id, oid) => updateEvent(id, (e) => ({ ...e, datePoll: (e.datePoll || []).map((o) => o.id === oid ? { ...o, votes: o.votes.includes(me) ? o.votes.filter((v) => v !== me) : [...o.votes, me] } : o) })),
    lockDate: (id, oid) => updateEvent(id, (e) => { const o = (e.datePoll || []).find((x) => x.id === oid); return o ? { ...e, date: o.date, endDate: "", time: o.time || e.time } : e; }),
    setTransport: (id, entry) => updateEvent(id, (e) => ({ ...e, transport: [...(e.transport || []).filter((t) => t.by !== me), { id: uid(), by: me, ...entry }] })),
    delTransport: (id) => updateEvent(id, (e) => ({ ...e, transport: (e.transport || []).filter((t) => t.by !== me) })),
  }), [me, updateEvent, events]);

  const addAvail = (o) => saveAvail([{ ...o, id: uid(), by: me }, ...availability]);
  const delAvail = (id) => saveAvail(availability.filter((a) => a.id !== id));

  const addProposal = async (p) => { await saveProposals([{ ...p, id: uid(), by: me, votes: [me] }, ...proposals]); setModal(null); };
  const toggleVote = async (id) => saveProposals(proposals.map((p) => {
    if (p.id !== id) return p;
    const has = p.votes.includes(me);
    return { ...p, votes: has ? p.votes.filter((v) => v !== me) : [...p.votes, me] };
  }));
  const promote = async (p) => {
    const sc = p.scale || "daily";
    await saveEvents([{ id: uid(), title: p.title, category: p.category || "autre", scale: sc, city: p.city || "",
      date: "", endDate: "", time: "", endTime: "", place: "", description: p.note || "", links: [], createdBy: p.by, createdAt: Date.now(),
      rsvps: { [me]: "in" }, comments: [], todos: [], datePoll: [], transport: [], modules: { ...(sc === "big" ? MODULES_BIG : MODULES_DAILY), datePoll: true } }, ...events]);
    await saveProposals(proposals.filter((x) => x.id !== p.id));
    setTab("events"); setScale(sc);
  };

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

  const now = todayStr();
  const totalUpcoming = events.filter((e) => !(e.endDate || e.date) || (e.endDate || e.date) >= now).length;
  const selectedEvent = events.find((e) => e.id === selected);

  return (
    <div className="root">
      <style>{CSS}</style>
      {loading ? (
        <div className="center"><div className="spinner" /></div>
      ) : !me ? (
        <Onboarding onPick={pickName} />
      ) : selectedEvent ? (
        <EventDetail ev={selectedEvent} me={me} actions={actions} availability={availability} onBack={() => setSelected(null)} />
      ) : (
        <>
          <Header me={me} count={totalUpcoming} onSignOut={onSignOut} />
          <Tabs tab={tab} setTab={setTab} propCount={proposals.length} newCount={newCities.size} />
          <main className="wrap">
            {tab === "events" && (
              <>
                <div className="seg">
                  <button className={scale === "big" ? "on" : ""} onClick={() => setScale("big")}><Sparkles size={15} /> Big events</button>
                  <button className={scale === "daily" ? "on" : ""} onClick={() => setScale("daily")}>Au quotidien</button>
                </div>
                <div className="cities">
                  <button className={"citychip" + (city === "all" ? " on" : "")} onClick={() => pickCity("all")}>Toutes</button>
                  {CITY_LIST.map((c) => (
                    <button key={c} className={"citychip" + (city === c ? " on" : "")} onClick={() => pickCity(c)}>
                      {CITIES[c]} {c}{newCities.has(c) && <span className="dot" />}
                    </button>
                  ))}
                </div>
                <EventsView data={filtered} me={me} onOpen={setSelected} scale={scale} />
              </>
            )}
            {tab === "avail" && <AvailabilityView availability={availability} me={me} onAdd={addAvail} onDel={delAvail} />}
            {tab === "proposals" && <ProposalsView proposals={proposals} me={me} onVote={toggleVote} onPromote={promote} />}
          </main>
          {tab !== "avail" && (
            <button className="fab" onClick={() => setModal(tab === "events" ? "event" : "proposal")}>
              <Plus size={22} strokeWidth={2.4} />
              <span>{tab === "events" ? (scale === "big" ? "Ajouter un big event" : "Ajouter un event quotidien") : "Proposer une idée"}</span>
            </button>
          )}
        </>
      )}
      {modal === "event" && <EventForm defScale={scale} defCity={city !== "all" ? city : ""} onClose={() => setModal(null)} onSave={addEvent} />}
      {modal === "proposal" && <ProposalForm onClose={() => setModal(null)} onSave={addProposal} />}
    </div>
  );
}

// ---------- onboarding ----------
function Onboarding({ onPick }) {
  const [name, setName] = useState("");
  return (
    <div className="onb">
      <div className="onb-badge"><PartyPopper size={30} /></div>
      <div className="onb-kicker">CDM</div>
      <h1 className="onb-title">HUB Events CDM</h1>
      <p className="onb-sub">Le QG des plans de la bande. Ce qui arrive, ce qu'on propose, qui est chaud — Toulouse à Rome.</p>
      <label className="onb-label">C'est quoi ton petit nom ?</label>
      <input className="onb-input" value={name} autoFocus placeholder="Ex. Léo, Titi, Mecton…"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && onPick(name.trim())} />
      <button className="btn-primary big" disabled={!name.trim()} onClick={() => onPick(name.trim())}>On y va <Send size={16} /></button>
      <p className="onb-note">Ton nom sert juste à savoir qui vient et qui propose quoi.</p>
    </div>
  );
}

// ---------- header + tabs ----------
function Header({ me, count, onSignOut }) {
  return (
    <header className="hd">
      <div>
        <div className="hd-kicker"><Users size={13} /> HUB Events CDM</div>
        <h1 className="hd-title">{count > 0 ? `${count} plan${count > 1 ? "s" : ""} en approche` : "Aucun plan… pour l'instant"}</h1>
      </div>
      {onSignOut ? (
        <form action={onSignOut}>
          <button type="submit" className="hd-me" title={`${me} — se déconnecter`}>{me.slice(0, 2).toUpperCase()}</button>
        </form>
      ) : (
        <div className="hd-me" title={me}>{me.slice(0, 2).toUpperCase()}</div>
      )}
    </header>
  );
}
function Tabs({ tab, setTab, propCount, newCount }) {
  return (
    <div className="tabs">
      <button className={"tab" + (tab === "events" ? " on" : "")} onClick={() => setTab("events")}>
        <CalendarDays size={16} /> Événements {newCount > 0 && <span className="dot inline" />}
      </button>
      <button className={"tab" + (tab === "avail" ? " on" : "")} onClick={() => setTab("avail")}><CalendarX size={16} /> Dispos</button>
      <button className={"tab" + (tab === "proposals" ? " on" : "")} onClick={() => setTab("proposals")}>
        <Lightbulb size={16} /> Idées {propCount > 0 && <span className="pill">{propCount}</span>}
      </button>
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
        <div className="card-top">
          <span className="tag" style={{ color: cat.color, background: cat.color + "18" }}>{cat.emoji} {cat.label}</span>
          {noDate && !past ? <span className="cd poll"><CalendarClock size={12} /> Date à voter</span>
            : cd && !past && <span className={"cd" + (cd.live ? " live" : cd.soon ? " hot" : "")}>{cd.text}</span>}
        </div>
        <h3 className="card-title">{ev.title}</h3>
        <div className="card-meta">
          <span><CalendarDays size={14} /> {fmtRange(ev.date, ev.endDate)}{ev.time && !ev.endDate ? ` · ${ev.time}` : ""}</span>
          {ev.city && <span>{CITIES[ev.city] || <MapPin size={14} />} {ev.city}</span>}
        </div>
        <div className="card-foot">
          <span className="count"><Users size={14} /> {going} chaud{going > 1 ? "s" : ""}</span>
          {mine && <span className="mine" style={{ color: RS[mine].color }}>Toi : {RS[mine].short}</span>}
        </div>
      </div>
    </button>
  );
}

// ---------- event detail ----------
function EventDetail({ ev, me, actions, availability, onBack }) {
  const cat = CATS[ev.category] || CATS.autre;
  const cd = countdown(ev.date, ev.endDate, ev.time);
  const groups = { in: [], maybe: [], out: [] };
  Object.entries(ev.rsvps || {}).forEach(([n, s]) => groups[s]?.push(n));
  const mine = ev.rsvps?.[me];
  const isBig = (ev.scale || "daily") === "big";
  const links = (ev.links || []).filter((l) => l.url);
  const isCreator = ev.createdBy === me;
  const timeLabel = ev.time ? (ev.endTime ? `${ev.time} – ${ev.endTime}` : ev.time) : "";

  return (
    <div className="detail">
      <div className="detail-hero" style={{ background: `linear-gradient(135deg, ${cat.color}, ${cat.color}cc)` }}>
        <button className="ghost-btn light" onClick={onBack}><ChevronLeft size={18} /> Retour</button>
        <div className="detail-emoji">{cat.emoji}</div>
        <div className="detail-tags">
          <span className="tag light">{cat.label}</span>
          {isBig && <span className="tag light"><Sparkles size={12} /> Big event</span>}
          {ev.city && <span className="tag light">{CITIES[ev.city]} {ev.city}</span>}
        </div>
        <h1 className="detail-title">{ev.title}</h1>
        {ev.date ? (cd && !cd.past && <div className="detail-cd">{cd.text}</div>) : <div className="detail-cd"><CalendarClock size={13} /> Date à voter</div>}
      </div>

      <div className="wrap">
        <div className="info-row"><CalendarDays size={18} /><div><b>{fmtRange(ev.date, ev.endDate)}</b>{timeLabel && <span className="soft"> · {timeLabel}</span>}</div></div>
        {ev.place && <div className="info-row"><MapPin size={18} /><div><b>{ev.place}</b></div></div>}

        {ev.date && (
          <div className="cal-row">
            <button className="cal-btn" onClick={() => downloadICS(ev)}><CalendarPlus size={16} /> Apple / iCal</button>
            <a className="cal-btn" href={googleCalUrl(ev)} target="_blank" rel="noopener noreferrer"><CalendarPlus size={16} /> Google Agenda</a>
          </div>
        )}

        {ev.description && <p className="detail-desc">{ev.description}</p>}

        {isBig && links.length > 0 && (
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

        <div className="rsvp-box">
          <div className="rsvp-q">Tu es chaud ?</div>
          <div className="rsvp-btns">
            {Object.entries(RS).map(([k, v]) => {
              const Icon = v.icon; const on = mine === k;
              return <button key={k} className={"rsvp" + (on ? " on" : "")} style={on ? { background: v.color, borderColor: v.color, color: "#fff" } : { color: v.color }} onClick={() => actions.rsvp(ev.id, k)}><Icon size={16} /> {v.label}</button>;
            })}
          </div>
        </div>

        {["in", "maybe", "out"].map((k) => groups[k].length > 0 && (
          <div className="people" key={k}>
            <div className="people-label" style={{ color: RS[k].color }}>{RS[k].label} · {groups[k].length}</div>
            <div className="avatars">{groups[k].map((n) => <span className="avatar" key={n} style={{ borderColor: RS[k].color }} title={n}>{n.slice(0, 2).toUpperCase()}</span>)}</div>
          </div>
        ))}

        {modOn(ev, "transport") && <Transport ev={ev} me={me} actions={actions} />}
        {modOn(ev, "datePoll") && <DatePoll ev={ev} me={me} isCreator={isCreator} actions={actions} availability={availability} />}
        {modOn(ev, "todos") && <TodoList ev={ev} me={me} isCreator={isCreator} actions={actions} />}
        {modOn(ev, "comments") && <Comments ev={ev} me={me} actions={actions} />}

        {isCreator && <ModuleToggles ev={ev} actions={actions} />}
        <div className="detail-by">Créé par {ev.createdBy}</div>
        {isCreator && <button className="del-btn" onClick={() => actions.del(ev.id)}><Trash2 size={15} /> Supprimer l'event</button>}
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
  const [note, setNote] = useState(mine?.note || "");
  const seatsOffered = list.filter((t) => t.mode === "voiture").reduce((s, t) => s + (Number(t.seats) || 0), 0);
  const seekers = list.filter((t) => t.mode === "covoit").length;
  const save = () => { actions.setTransport(ev.id, { mode, seats: mode === "voiture" ? (Number(seats) || 0) : 0, note: note.trim() }); setEditing(false); };
  return (
    <section className="block">
      <div className="block-head"><Car size={17} /> Qui y va comment ?</div>
      {(seatsOffered > 0 || seekers > 0) && (
        <div className="tp-summary">
          {seatsOffered > 0 && <span>🚗 {seatsOffered} place{seatsOffered > 1 ? "s" : ""} offerte{seatsOffered > 1 ? "s" : ""}</span>}
          {seekers > 0 && <span>🙋 {seekers} cherche{seekers > 1 ? "nt" : ""} une place</span>}
        </div>
      )}
      {list.length === 0 && !editing && <p className="block-hint">Dis comment tu comptes t'y rendre — pratique pour s'organiser en covoiturage.</p>}
      {list.map((t) => {
        const m = TRANSPORT[t.mode] || TRANSPORT.autre; const Icon = m.icon;
        return (
          <div className="tprow" key={t.id}>
            <span className="tp-ic" style={{ background: m.color }}><Icon size={16} /></span>
            <div className="tp-info"><b>{t.by}</b> · {m.label}{t.mode === "voiture" && t.seats > 0 && <span className="soft"> ({t.seats} place{t.seats > 1 ? "s" : ""})</span>}{t.note && <div className="tp-note">{t.note}</div>}</div>
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
          <input className="tp-noteinput" value={note} placeholder="Départ d'où, à quelle heure… (optionnel)" onChange={(e) => setNote(e.target.value)} />
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

// ---------- sondage de dates ----------
function DatePoll({ ev, me, isCreator, actions, availability }) {
  const [d, setD] = useState(""); const [t, setT] = useState("");
  const poll = [...(ev.datePoll || [])].sort((a, b) => b.votes.length - a.votes.length);
  const add = () => { if (!d) return; actions.addDate(ev.id, d, t); setD(""); setT(""); };
  const conflictsFor = (date) => [...new Set((availability || []).filter((a) => a.start <= date && (a.end || a.start) >= date).map((a) => a.by))];
  return (
    <section className="block">
      <div className="block-head"><CalendarClock size={17} /> Sondage de dates</div>
      {!ev.date && poll.length === 0 && <p className="block-hint">Pas encore de date. Proposez des créneaux, chacun vote pour ses dispos. Les indispos connues sont signalées.</p>}
      {ev.date && <p className="block-hint">Date fixée : {fmtRange(ev.date, ev.endDate)}. Vous pouvez proposer d'autres créneaux.</p>}
      {poll.map((o) => {
        const voted = o.votes.includes(me); const conf = conflictsFor(o.date);
        return (
          <div className="pollrow" key={o.id}>
            <button className={"pollvote" + (voted ? " on" : "")} onClick={() => actions.voteDate(ev.id, o.id)}><Check size={14} /> {o.votes.length}</button>
            <div className="pollinfo">
              <b>{shortDate(o.date)}</b>{o.time && <span className="soft"> · {o.time}</span>}
              {o.votes.length > 0 && <div className="pollnames">{o.votes.join(", ")}</div>}
              {conf.length > 0 && <div className="pollwarn"><AlertTriangle size={12} /> Indispo : {conf.join(", ")}</div>}
            </div>
            {isCreator && <button className="polllock" onClick={() => actions.lockDate(ev.id, o.id)} title="Figer cette date"><Lock size={14} /></button>}
          </div>
        );
      })}
      <div className="polladd">
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} />
        <input type="time" value={t} onChange={(e) => setT(e.target.value)} />
        <button className="polladd-btn" onClick={add} disabled={!d}><Plus size={16} /></button>
      </div>
    </section>
  );
}

// ---------- to-do / liste ----------
function TodoList({ ev, me, isCreator, actions }) {
  const [text, setText] = useState("");
  const todos = ev.todos || [];
  const add = () => { if (!text.trim()) return; actions.addTodo(ev.id, text.trim()); setText(""); };
  return (
    <section className="block">
      <div className="block-head"><ListTodo size={17} /> À ramener / liste de courses</div>
      {todos.length === 0 && <p className="block-hint">Ajoutez ce qu'il faut prévoir — chacun peut cocher ce qu'il prend en charge.</p>}
      {todos.map((t) => (
        <div className={"todorow" + (t.done ? " done" : "")} key={t.id}>
          <button className="todocheck" onClick={() => actions.toggleTodo(ev.id, t.id)}>{t.done ? <CheckCircle2 size={20} /> : <Circle size={20} />}</button>
          <div className="todotext"><span>{t.text}</span><small>{t.done ? `pris par ${t.doneBy}` : `ajouté par ${t.by}`}</small></div>
          {(t.by === me || isCreator) && <button className="tododel" onClick={() => actions.delTodo(ev.id, t.id)}><X size={15} /></button>}
        </div>
      ))}
      <div className="addrow">
        <input value={text} placeholder="Ex. Charbon, salade, enceinte…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
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
            <div className="cmt-head"><b>{c.by}</b><span className="soft">{timeAgo(c.at)}</span>{c.by === me && <button className="cmt-del" onClick={() => actions.delComment(ev.id, c.id)}><X size={13} /></button>}</div>
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
            <div className="block-head"><span className="cmt-av">{person.slice(0, 2).toUpperCase()}</span> {person}</div>
            {arr.map((a) => (<div className="availrow" key={a.id}><div className="availrow-info"><b>{fmtRange(a.start, a.end)}</b>{a.note && <span className="soft"> · {a.note}</span>}</div></div>))}
          </div>
        ))
      )}
    </div>
  );
}

// ---------- proposals ----------
function ProposalsView({ proposals, me, onVote, onPromote }) {
  if (proposals.length === 0)
    return <Empty icon={<Lightbulb size={26} />} title="Aucune idée sur la table" text="Balance une proposition, les autres votent. Si ça prend (2+ votes), tu la transformes en event." />;
  const sorted = [...proposals].sort((a, b) => b.votes.length - a.votes.length);
  return sorted.map((p) => {
    const cat = CATS[p.category] || CATS.autre; const voted = p.votes.includes(me);
    return (
      <div className="prop" key={p.id}>
        <button className={"vote" + (voted ? " on" : "")} onClick={() => onVote(p.id)}><ArrowUp size={18} strokeWidth={2.6} /><b>{p.votes.length}</b></button>
        <div className="prop-body">
          <div className="prop-tags">
            <span className="tag sm" style={{ color: cat.color, background: cat.color + "18" }}>{cat.emoji} {cat.label}</span>
            {p.scale === "big" && <span className="tag sm ghost"><Sparkles size={11} /> Big</span>}
            {p.city && <span className="tag sm ghost">{CITIES[p.city]} {p.city}</span>}
          </div>
          <h3 className="prop-title">{p.title}</h3>
          {p.note && <p className="prop-note">{p.note}</p>}
          <div className="prop-foot"><span className="soft">par {p.by}</span>{p.votes.length >= 2 && <button className="promote" onClick={() => onPromote(p)}><Sparkles size={14} /> En faire un event</button>}</div>
        </div>
      </div>
    );
  });
}

// ---------- form bits ----------
function Field({ label, children, hint }) { return <label className="field"><span>{label}</span>{children}{hint && <em className="field-hint">{hint}</em>}</label>; }
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
function CityPicker({ value, onChange }) {
  return (
    <div className="catpick">
      {CITY_LIST.map((c) => (
        <button key={c} type="button" className={"catchip city" + (value === c ? " on" : "")} onClick={() => onChange(value === c ? "" : c)}>{CITIES[c]} {c}</button>
      ))}
    </div>
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

function EventForm({ defScale, defCity, onClose, onSave }) {
  const [f, setF] = useState({
    title: "", category: "soiree", scale: defScale || "big", city: defCity || "",
    date: "", endDate: "", time: "", endTime: "", place: "", description: "",
    usePoll: false, tricount: "", messenger: "", otherLabel: "", otherUrl: "",
    modules: { ...(defScale === "big" ? MODULES_BIG : MODULES_DAILY) },
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isBig = f.scale === "big";

  // quand on change de type, on réaligne les sections par défaut de ce type
  const switchScale = (s) => setF({ ...f, scale: s, modules: { ...(s === "big" ? MODULES_BIG : MODULES_DAILY), datePoll: f.usePoll || (s === "big" ? MODULES_BIG : MODULES_DAILY).datePoll } });

  const save = () => {
    const links = [];
    if (isBig) {
      if (f.tricount.trim()) links.push({ kind: "tricount", label: "Tricount", url: f.tricount.trim() });
      if (f.messenger.trim()) links.push({ kind: "messenger", label: "Conv Messenger", url: f.messenger.trim() });
      if (f.otherUrl.trim()) links.push({ kind: "other", label: f.otherLabel.trim() || "Lien", url: f.otherUrl.trim() });
    }
    const endDate = isBig && f.endDate && f.endDate >= f.date ? f.endDate : "";
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
      <Field label="Nature de l'event"><ScaleSeg value={f.scale} onChange={switchScale} /></Field>
      <Field label="Ça s'appelle comment ?"><input value={f.title} onChange={set("title")} autoFocus placeholder={isBig ? "Ex. Nouvel An à Rome" : "Ex. Apéro du jeudi"} /></Field>
      <Field label="Ville"><CityPicker value={f.city} onChange={(c) => setF({ ...f, city: c })} /></Field>
      <Field label="Catégorie"><CatPicker value={f.category} onChange={(c) => setF({ ...f, category: c })} /></Field>

      {!f.usePoll && (isBig ? (
        <div className="row2">
          <Field label="Date de début"><input type="date" value={f.date} onChange={set("date")} /></Field>
          <Field label="Date de fin"><input type="date" value={f.endDate} min={f.date} onChange={set("endDate")} /></Field>
        </div>
      ) : (
        <>
          <Field label="Date"><input type="date" value={f.date} onChange={set("date")} /></Field>
          <div className="row2">
            <Field label="Heure de début"><input type="time" value={f.time} onChange={set("time")} /></Field>
            <Field label="Heure de fin"><input type="time" value={f.endTime} onChange={set("endTime")} /></Field>
          </div>
        </>
      ))}

      <label className="toggle-row">
        <input type="checkbox" checked={f.usePoll} onChange={(e) => setF({ ...f, usePoll: e.target.checked })} />
        <span><b>Pas encore de date ?</b> Lancer un sondage de dates à la place<em>Parfait pour un plan lointain — vous voterez le créneau ensuite.</em></span>
      </label>

      <Field label="Où ?"><input value={f.place} onChange={set("place")} placeholder="Adresse, bar, lieu…" /></Field>
      <Field label="Détails (optionnel)"><textarea value={f.description} onChange={set("description")} rows={3} placeholder="Programme, ce qu'il faut ramener…" /></Field>

      <Field label="Sections à activer" hint={isBig ? "Un big event a tout par défaut." : "Un event quotidien reste léger par défaut."}>
        <div className="catpick">
          {MODULE_LABELS.map(([k, l]) => {
            const on = k === "datePoll" ? (f.usePoll || f.modules[k]) : f.modules[k];
            const locked = k === "datePoll" && f.usePoll;
            return <button key={k} type="button" disabled={locked} className={"catchip mod" + (on ? " on" : "") + (locked ? " locked" : "")}
              onClick={() => !locked && setF({ ...f, modules: { ...f.modules, [k]: !f.modules[k] } })}>{on ? <Check size={13} /> : <Plus size={13} />} {l}</button>;
          })}
        </div>
      </Field>

      {isBig && (
        <div className="links-form">
          <div className="links-form-head"><Sparkles size={14} /> Liens du plan <span>réservé aux big events</span></div>
          <Field label="Lien Tricount"><input value={f.tricount} onChange={set("tricount")} placeholder="tricount.com/…" /></Field>
          <Field label="Lien conv Messenger"><input value={f.messenger} onChange={set("messenger")} placeholder="m.me/… ou lien du groupe" /></Field>
          <div className="row2">
            <Field label="Autre lien — nom"><input value={f.otherLabel} onChange={set("otherLabel")} placeholder="Ex. Playlist, Airbnb…" /></Field>
            <Field label="Autre lien — URL"><input value={f.otherUrl} onChange={set("otherUrl")} placeholder="https://…" /></Field>
          </div>
        </div>
      )}

      <button className="btn-primary big" disabled={!f.title.trim() || !f.city || (!f.usePoll && !f.date)}
        onClick={save}>{!f.city ? "Choisis une ville" : (!f.usePoll && !f.date) ? "Choisis une date (ou un sondage)" : "Créer l'event"}</button>
    </Modal>
  );
}

function ProposalForm({ onClose, onSave }) {
  const [f, setF] = useState({ title: "", category: "autre", scale: "daily", city: "", note: "" });
  return (
    <Modal title="Proposer une idée" onClose={onClose}>
      <Field label="Ton idée"><input value={f.title} autoFocus onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. Week-end à Bordeaux cet été" /></Field>
      <Field label="Nature"><ScaleSeg value={f.scale} onChange={(s) => setF({ ...f, scale: s })} /></Field>
      <Field label="Ville (optionnel)"><CityPicker value={f.city} onChange={(c) => setF({ ...f, city: c })} /></Field>
      <Field label="Catégorie"><CatPicker value={f.category} onChange={(c) => setF({ ...f, category: c })} /></Field>
      <Field label="Un mot d'explication (optionnel)"><textarea value={f.note} rows={3} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="On pourrait…" /></Field>
      <button className="btn-primary big" disabled={!f.title.trim()} onClick={() => onSave({ ...f, title: f.title.trim() })}>Balancer l'idée</button>
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

// ---------- seed ----------
function seedEvents() {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const now = Date.now();
  return [
    { id: uid(), title: "Nouvel An à Rome 🇮🇹", category: "voyage", scale: "big", city: "Rome", date: d(20), endDate: d(23), time: "", endTime: "",
      place: "Trastevere", description: "Le gros plan de l'année. Réservez vos billets tôt.",
      links: [{ kind: "tricount", label: "Tricount", url: "https://tricount.com" }, { kind: "messenger", label: "Conv Messenger", url: "https://m.me" }],
      createdBy: "CDM", createdAt: now, rsvps: { "CDM": "in" }, comments: [], todos: [{ id: uid(), text: "Réserver l'Airbnb", by: "CDM", done: false }],
      datePoll: [], transport: [{ id: uid(), by: "CDM", mode: "avion", seats: 0, note: "Vol depuis Toulouse" }], modules: { ...MODULES_BIG } },
    { id: uid(), title: "Week-end rando (à caler)", category: "voyage", scale: "big", city: "Bordeaux", date: "", endDate: "", time: "", endTime: "",
      place: "", description: "On vise le printemps. Votez vos dispos !", links: [], createdBy: "CDM", createdAt: now,
      rsvps: { "CDM": "in" }, comments: [], todos: [], transport: [],
      datePoll: [{ id: uid(), date: d(40), time: "", votes: ["CDM"] }, { id: uid(), date: d(54), time: "", votes: [] }], modules: { ...MODULES_BIG } },
    { id: uid(), title: "Apéro du jeudi", category: "soiree", scale: "daily", city: "Toulouse", date: d(2), time: "19:30", endTime: "23:00", endDate: "",
      place: "Chez Léo", description: "Le rituel.", links: [], createdBy: "CDM", createdAt: now, rsvps: { "CDM": "in" }, comments: [], todos: [], datePoll: [], transport: [], modules: { ...MODULES_DAILY } },
    { id: uid(), title: "Pique-nique au parc", category: "picnic", scale: "daily", city: "Paris", date: d(-3), time: "12:30", endTime: "16:00", endDate: "",
      place: "Buttes-Chaumont", description: "C'était top !", links: [], createdBy: "CDM", createdAt: now, rsvps: { "CDM": "in" }, comments: [], todos: [], datePoll: [], transport: [], modules: { ...MODULES_DAILY } },
  ];
}
function seedAvail() {
  const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  return [{ id: uid(), by: "CDM", start: d(40), end: d(41), note: "Déjà pris ce week-end" }];
}

// ---------- styles ----------
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@400;500;600&display=swap');
.root{--bg:#F4F2ED;--card:#FFFFFF;--ink:#211D2B;--muted:#726C7E;--line:#E6E2D8;--accent:#6D28D9;--accent-soft:#EDE6FB;
  font-family:'Inter',system-ui,sans-serif;color:var(--ink);background:var(--bg);min-height:100vh;max-width:560px;margin:0 auto;position:relative;-webkit-font-smoothing:antialiased;}
*{box-sizing:border-box;}
h1,h2,h3{font-family:'Bricolage Grotesque',sans-serif;margin:0;letter-spacing:-.02em;}
button{font-family:inherit;cursor:pointer;border:none;background:none;}
a{text-decoration:none;color:inherit;}
.wrap{padding:14px 18px 120px;}
.center{display:flex;justify-content:center;align-items:center;min-height:100vh;}
.spinner{width:34px;height:34px;border:3px solid var(--accent-soft);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite;}
@keyframes spin{to{transform:rotate(360deg);}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;}}

.onb{padding:52px 26px;display:flex;flex-direction:column;min-height:100vh;justify-content:center;}
.onb-badge{width:64px;height:64px;border-radius:20px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 8px 24px -6px var(--accent);}
.onb-kicker{font-family:'Bricolage Grotesque';font-weight:800;letter-spacing:.14em;color:var(--accent);font-size:13px;margin-bottom:4px;}
.onb-title{font-size:40px;font-weight:800;line-height:1;}
.onb-sub{color:var(--muted);font-size:16px;margin:12px 0 32px;line-height:1.5;max-width:36ch;}
.onb-label{font-weight:600;font-size:14px;margin-bottom:8px;}
.onb-input{width:100%;padding:15px 16px;border:2px solid var(--line);border-radius:14px;font-size:17px;background:var(--card);outline:none;transition:border-color .15s;}
.onb-input:focus{border-color:var(--accent);}
.onb-note{color:var(--muted);font-size:12.5px;margin-top:14px;}

.hd{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 18px 12px;gap:12px;}
.hd-kicker{display:inline-flex;align-items:center;gap:5px;color:var(--accent);font-weight:600;font-size:12.5px;background:var(--accent-soft);padding:4px 10px;border-radius:20px;}
.hd-title{font-size:26px;font-weight:800;margin-top:9px;line-height:1.08;max-width:16ch;}
.hd-me{flex-shrink:0;width:42px;height:42px;border-radius:14px;background:var(--ink);color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;font-family:'Bricolage Grotesque';}

.tabs{display:flex;gap:6px;padding:0 18px 4px;}
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

.card{display:flex;width:100%;text-align:left;background:var(--card);border-radius:18px;margin-bottom:12px;overflow:hidden;border:1px solid var(--line);transition:transform .12s,box-shadow .12s;}
.card:hover{transform:translateY(-2px);box-shadow:0 10px 26px -14px rgba(33,29,43,.4);}
.card:active{transform:translateY(0);}
.card.past{opacity:.66;}
.card-stripe{width:6px;background:var(--cat);flex-shrink:0;}
.card-body{padding:14px 16px;flex:1;min-width:0;}
.card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:9px;}
.tag{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;white-space:nowrap;}
.tag.sm{font-size:11.5px;padding:3px 9px;}
.tag.ghost{background:var(--bg);color:var(--muted);}
.tag.light{background:rgba(255,255,255,.22);color:#fff;}
.cd{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:3px 9px;border-radius:8px;font-family:'Bricolage Grotesque';}
.cd.hot{color:#fff;background:#DB2777;}
.cd.live{color:#fff;background:#0D9488;}
.cd.poll{color:#B45309;background:#FEF3C7;}
.card-title{font-size:18px;font-weight:700;line-height:1.2;}
.card-meta{display:flex;flex-wrap:wrap;gap:12px;margin:9px 0 11px;color:var(--muted);font-size:13px;}
.card-meta span{display:inline-flex;align-items:center;gap:5px;}
.card-foot{display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);padding-top:10px;}
.count{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:600;color:var(--ink);}
.mine{font-size:12.5px;font-weight:600;}
.section-label{font-size:12px;font-weight:600;color:var(--muted);margin:20px 4px 12px;}

.past-wrap{margin-top:18px;}
.past-toggle{display:flex;align-items:center;gap:7px;width:100%;padding:12px 15px;background:transparent;border:1.5px dashed var(--line);border-radius:14px;color:var(--muted);font-weight:600;font-size:13.5px;transition:.15s;}
.past-toggle:hover{border-color:var(--muted);}
.past-toggle svg{transition:transform .2s;}
.past-toggle.open{margin-bottom:12px;}
.past-toggle.open svg{transform:rotate(180deg);}

.detail{min-height:100vh;}
.detail-hero{padding:16px 18px 30px;color:#fff;border-radius:0 0 26px 26px;}
.detail-emoji{font-size:44px;margin:16px 0 10px;}
.detail-tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;}
.ghost-btn{display:inline-flex;align-items:center;gap:4px;font-weight:600;font-size:14px;padding:7px 12px 7px 8px;border-radius:10px;color:var(--muted);}
.ghost-btn.light{background:rgba(255,255,255,.18);color:#fff;}
.ghost-btn.danger{color:#DC2626;}
.detail-title{font-size:29px;font-weight:800;line-height:1.05;}
.detail-cd{display:inline-flex;align-items:center;gap:5px;margin-top:14px;background:rgba(255,255,255,.22);font-family:'Bricolage Grotesque';font-weight:700;padding:6px 14px;border-radius:12px;font-size:15px;}
.info-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);color:var(--accent);}
.info-row div{color:var(--ink);font-size:15px;}
.info-row .soft{color:var(--muted);font-weight:400;}
.detail-desc{margin:16px 0;line-height:1.6;color:#443E52;font-size:15px;}

.cal-row{display:flex;gap:9px;margin-top:14px;}
.cal-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);font-weight:600;font-size:13.5px;color:var(--ink);transition:.12s;}
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

.rsvp-box{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin:18px 0;}
.rsvp-q{font-weight:700;font-family:'Bricolage Grotesque';font-size:16px;margin-bottom:12px;}
.rsvp-btns{display:flex;gap:8px;}
.rsvp{flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;padding:12px 4px;border:2px solid var(--line);border-radius:13px;font-weight:600;font-size:12.5px;transition:.15s;background:var(--card);}
.people{margin:16px 0;}
.people-label{font-weight:700;font-size:13.5px;font-family:'Bricolage Grotesque';margin-bottom:9px;}
.avatars{display:flex;flex-wrap:wrap;gap:7px;}
.avatar{width:40px;height:40px;border-radius:12px;background:var(--card);border:2px solid;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;font-family:'Bricolage Grotesque';color:var(--ink);}

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
.tp-seats,.tp-noteinput{width:100%;padding:11px 13px;border:2px solid var(--line);border-radius:12px;font-size:14.5px;background:var(--bg);outline:none;font-family:inherit;margin-top:10px;}
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
.polladd{display:flex;gap:8px;margin-top:12px;}
.polladd input{flex:1;min-width:0;padding:10px;border:2px solid var(--line);border-radius:11px;font-size:14px;background:var(--bg);outline:none;font-family:inherit;}
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
.addrow input{flex:1;min-width:0;padding:11px 13px;border:2px solid var(--line);border-radius:12px;font-size:14.5px;background:var(--bg);outline:none;font-family:inherit;}
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
.field.mini input{padding:10px 12px;font-size:14px;}

.detail-by{color:var(--muted);font-size:13px;margin:22px 0 10px;}
.del-btn{display:inline-flex;align-items:center;gap:7px;color:#DC2626;font-weight:600;font-size:14px;padding:10px 14px;border-radius:11px;border:1px solid #FCA5A5;background:#FEF2F2;}

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

.fab{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;background:var(--accent);color:#fff;font-weight:700;font-size:15px;padding:14px 22px;border-radius:30px;box-shadow:0 10px 30px -6px var(--accent);z-index:20;font-family:'Bricolage Grotesque';white-space:nowrap;}
.fab:active{transform:translateX(-50%) scale(.97);}

.empty{text-align:center;padding:54px 30px;}
.empty-ic{width:60px;height:60px;border-radius:18px;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;}
.empty h3{font-size:20px;font-weight:700;margin-bottom:8px;}
.empty p{color:var(--muted);line-height:1.5;max-width:32ch;margin:0 auto;font-size:14.5px;}

.overlay{position:fixed;inset:0;background:rgba(20,17,28,.5);display:flex;align-items:flex-end;justify-content:center;z-index:50;animation:fade .2s;}
.sheet{background:var(--bg);width:100%;max-width:560px;border-radius:24px 24px 0 0;max-height:92vh;overflow-y:auto;animation:up .25s cubic-bezier(.2,.8,.2,1);}
@keyframes fade{from{opacity:0;}}
@keyframes up{from{transform:translateY(30px);}}
.sheet-head{display:flex;justify-content:space-between;align-items:center;padding:20px 20px 6px;position:sticky;top:0;background:var(--bg);z-index:2;}
.sheet-head h2{font-size:22px;font-weight:800;}
.x{width:36px;height:36px;border-radius:50%;background:var(--card);display:flex;align-items:center;justify-content:center;color:var(--muted);border:1px solid var(--line);}
.sheet-body{padding:12px 20px 30px;}
.field{display:block;margin-bottom:16px;}
.field>span{display:block;font-weight:600;font-size:13.5px;margin-bottom:7px;}
.field-hint{display:block;color:var(--muted);font-size:12px;font-style:normal;margin-top:6px;}
.field input,.field textarea{width:100%;padding:13px 14px;border:2px solid var(--line);border-radius:12px;font-size:15px;background:var(--card);outline:none;font-family:inherit;transition:border-color .15s;}
.field input:focus,.field textarea:focus{border-color:var(--accent);}
.field textarea{resize:vertical;}
.row2{display:flex;gap:12px;}
.row2 .field{flex:1;}
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

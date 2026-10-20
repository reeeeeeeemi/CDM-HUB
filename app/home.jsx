"use client";

/**
 * L'accueil d'un groupe.
 *
 *   · « À toi de jouer » : ce qui attend un geste de ta part — répondre se
 *     fait sur place, un vote de date ouvre la fiche
 *   · une bascule Liste / Calendrier
 *       Liste : l'agenda, « Cette semaine » puis un intercalaire par mois,
 *       chacun se replie ; ta réponse en pastille sur chaque ligne
 *       Calendrier : le mois, chaque event en barre de la couleur de ta
 *       réponse ; un refus n'y figure pas, il reste dans la liste
 */

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, CalendarClock, Users, Hand, Check, HelpCircle, X } from "lucide-react";

import { categoryOf } from "@/lib/catalog";
import { cityEmoji } from "@/lib/group";

// Vert : j'y vais. Orange : peut-être. Rouge : pas dispo. Gris pointillé :
// pas encore répondu.
const ANSWER = {
  in:    { label: "Je viens",     short: "J'y vais",  color: "#16A34A", soft: "#DCFCE7" },
  maybe: { label: "Peut-être",    short: "Peut-être", color: "#EA8A0C", soft: "#FEF3C7" },
  out:   { label: "Pas dispo",    short: "Non",       color: "#DC2626", soft: "#FEE2E2" },
  none:  { label: "Sans réponse", short: "À toi",     color: "#94A3B8", soft: "#F1F5F9" },
};
const answerOf = (ev, me) => ev.rsvps?.[me] || "none";

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(s + "T00:00:00");
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const todayIso = () => isoOf(new Date());
const endOf = (ev) => ev.endDate || ev.date;
const isPast = (ev) => Boolean(ev.date) && endOf(ev) < todayIso();
const monthLabel = (d, withYear) =>
  d.toLocaleDateString("fr-FR", { month: "long", ...(withYear ? { year: "numeric" } : {}) }).replace(/^./, (c) => c.toUpperCase());
const dayShort = (s) => parse(s).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
const going = (ev) => Object.values(ev.rsvps || {}).filter((s) => s === "in").length;
// Lundi d'abord, à la française.
const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));

/**
 * Ce qui attend un geste de ta part, sur les plans à venir : un sondage de
 * date où tu n'as pas voté, sinon une réponse que tu n'as pas donnée. Un
 * seul motif par event, le plus urgent. Le lieu, lui, ne réclame rien : il
 * se règle sans toi.
 */
function toPlay(events, me) {
  return events
    .filter((ev) => !isPast(ev))
    .flatMap((ev) => {
      const votedDate = (ev.datePoll || []).some((o) => o.votes.includes(me));
      if (!ev.date && (ev.datePoll || []).length > 0 && !votedDate) return [{ ev, why: "Vote pour la date", icon: CalendarClock }];
      if (!ev.rsvps?.[me]) return [{ ev, why: "Tu viens ?", icon: Hand, rsvp: true }];
      return [];
    })
    .sort((a, b) => (a.ev.date || "9999").localeCompare(b.ev.date || "9999"));
}

// ---------- briques communes ----------
const QUICK = [
  ["in", "J'y vais", Check],
  ["maybe", "Peut-être", HelpCircle],
  ["out", "Non", X],
];

/**
 * « Tu viens ? » se répond sur place : trois pastilles discrètes à droite
 * de la ligne, et la ligne quitte le bloc. Un vote de date, lui, demande la
 * fiche.
 */
function ToPlay({ events, me, onOpen, onRsvp }) {
  const items = useMemo(() => toPlay(events, me), [events, me]);
  const [all, setAll] = useState(false);
  if (items.length === 0) return <div className="hm-done">Tu es à jour sur tous les plans 👌</div>;
  const shown = all ? items : items.slice(0, 3);
  return (
    <section className="hm-play">
      <h2>À toi de jouer <span>{items.length}</span></h2>
      {shown.map(({ ev, why, icon: Icon, rsvp }) => (
        <div key={ev.id} className="hm-play-item">
          <button className="hm-play-row" onClick={() => onOpen(ev.id)}>
            <span className="hm-play-ic"><Icon size={15} /></span>
            <span className="hm-play-txt">
              <b>{ev.title}</b>
              <em>{why}{ev.date && <span> · {parse(ev.date).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}</span>}</em>
            </span>
            {!(rsvp && onRsvp) && <ChevronRight size={16} />}
          </button>
          {rsvp && onRsvp && (
            <span className="hm-quick">
              {QUICK.map(([k, label, I]) => (
                <button key={k} aria-label={label} title={label} style={{ "--a": ANSWER[k].color }} onClick={() => onRsvp(ev.id, k)}>
                  <I size={14} strokeWidth={2.6} />
                </button>
              ))}
            </span>
          )}
        </div>
      ))}
      {items.length > 3 && (
        <button className="hm-more" onClick={() => setAll(!all)}>{all ? "Moins" : `Voir les ${items.length - 3} autres`}</button>
      )}
    </section>
  );
}

/** Une ligne d'agenda : la date en gros, une ligne de détails, ta réponse. */
function Row({ ev, me, group, onOpen }) {
  const cat = categoryOf(ev.category);
  const a = ANSWER[answerOf(ev, me)];
  const multi = ev.endDate && ev.endDate !== ev.date;
  return (
    <button className={"hm-row" + (isPast(ev) ? " past" : "")} onClick={() => onOpen(ev.id)}>
      <span className="hm-date">
        {ev.date ? (
          <>
            <b>{parse(ev.date).getDate()}{multi && <small>–{parse(ev.endDate).getDate()}</small>}</b>
            <em>{dayShort(ev.date)}</em>
          </>
        ) : <CalendarClock size={18} />}
      </span>
      <span className="hm-body">
        <b>{ev.title}</b>
        <em>
          {cat.emoji}
          {ev.city && <> · {cityEmoji(group.cities, ev.city)} {ev.city}</>}
          {ev.time && <> · {ev.time}</>}
          <> · <Users size={11} /> {going(ev)}</>
          {ev.unread > 0 && <span className="hm-unread">💬 {ev.unread}</span>}
        </em>
      </span>
      <span className="hm-ans" style={{ color: a.color, background: a.soft, borderStyle: answerOf(ev, me) === "none" ? "dashed" : "solid", borderColor: a.color }}>
        {a.short}
      </span>
    </button>
  );
}

// Les sections repliées, retenues par appareil et par groupe : c'est une
// préférence d'affichage, pas une donnée du groupe.
const foldKey = (g) => `hub:agenda-folded:${g}`;
const readFolded = (g) => { try { return new Set(JSON.parse(window.localStorage.getItem(foldKey(g)) || "[]")); } catch { return new Set(); } };

/**
 * L'agenda : « Cette semaine », un intercalaire par mois, les dates à voter
 * à la fin, le passé replié.
 */
function Agenda({ events, me, group, onOpen }) {
  const [showPast, setShowPast] = useState(false);
  const [folded, setFolded] = useState(() => readFolded(group.id));
  const toggle = (key) => setFolded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    try { window.localStorage.setItem(foldKey(group.id), JSON.stringify([...next])); } catch {}
    return next;
  });

  const up = events.filter((e) => e.date && !isPast(e)).sort((a, b) => a.date.localeCompare(b.date));
  const undated = events.filter((e) => !e.date);
  const past = events.filter(isPast).sort((a, b) => b.date.localeCompare(a.date));
  const thisYear = new Date().getFullYear();
  // « Cette semaine » : jusqu'au dimanche, et ce qui a déjà commencé.
  const sunday = isoOf(addDays(mondayOf(new Date()), 6));

  const sections = [];
  for (const ev of up) {
    const week = ev.date <= sunday;
    const key = week ? "week" : ev.date.slice(0, 7);
    const last = sections[sections.length - 1];
    if (last?.key === key) last.items.push(ev);
    else sections.push({
      key,
      label: week ? "Cette semaine" : monthLabel(parse(ev.date), parse(ev.date).getFullYear() !== thisYear),
      items: [ev],
    });
  }
  if (undated.length) sections.push({ key: "undated", label: "Date à voter", items: undated });
  const months = sections;

  return (
    <div className="hm-agenda">
      {months.length === 0 && <p className="hm-empty">Rien de prévu ici.</p>}
      {/* Un intercalaire se touche pour replier sa section : on garde le
          titre et le compte, on cache les lignes. */}
      {months.map((m) => {
        const shut = folded.has(m.key);
        return (
          <section key={m.key}>
            <button className={"hm-month" + (shut ? " shut" : "")} aria-expanded={!shut} onClick={() => toggle(m.key)}>
              <ChevronDown size={15} /> {m.label} <span>{m.items.length}</span>
            </button>
            {!shut && m.items.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} />)}
          </section>
        );
      })}
      {past.length > 0 && (
        <>
          <button className="hm-past" onClick={() => setShowPast(!showPast)}>
            <ChevronDown size={15} style={{ transform: showPast ? "rotate(180deg)" : "" }} /> Passés ({past.length})
          </button>
          {showPast && past.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} />)}
        </>
      )}
    </div>
  );
}

// ---------- le calendrier ----------
/**
 * Les events d'une semaine posés en barres sur 7 colonnes, chacun sur la
 * première ligne libre. Un week-end de ski occupe ses trois jours.
 */
function lanesFor(events, weekStart) {
  const ws = isoOf(weekStart), we = isoOf(addDays(weekStart, 6));
  const hits = events
    .filter((e) => e.date && e.date <= we && endOf(e) >= ws)
    .sort((a, b) => a.date.localeCompare(b.date) || endOf(b).localeCompare(endOf(a)));
  const lanes = [];
  for (const ev of hits) {
    const from = ev.date < ws ? 0 : (parse(ev.date) - weekStart) / 864e5;
    const to = endOf(ev) > we ? 6 : (parse(endOf(ev)) - weekStart) / 864e5;
    let lane = lanes.findIndex((l) => l.every((x) => x.to < from || x.from > to));
    if (lane === -1) { lanes.push([]); lane = lanes.length - 1; }
    lanes[lane].push({ ev, from: Math.round(from), to: Math.round(to), cutLeft: ev.date < ws, cutRight: endOf(ev) > we });
  }
  return lanes;
}

function Calendar({ events, me, group, onOpen }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(todayIso());
  // Un refus quitte le calendrier : il ne dit rien de ton emploi du temps.
  // L'event reste dans la liste, où l'on peut changer d'avis.
  const shown = events.filter((e) => answerOf(e, me) !== "out");

  const first = mondayOf(month);
  const last = addDays(new Date(month.getFullYear(), month.getMonth() + 1, 1), -1);
  const weeks = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(w);
  const MAX = 3;

  const dayEvents = shown.filter((e) => e.date && e.date <= day && endOf(e) >= day);
  const undated = shown.filter((e) => !e.date && !isPast(e));

  return (
    <>
      <section className="hm-cal">
        <div className="hm-cal-head">
          <button aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
          <h2>{monthLabel(month, true)}</h2>
          <button aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
        </div>
        <div className="hm-legend">
          {["in", "maybe", "none"].map((k) => (
            <span key={k}><i style={{ background: k === "none" ? "transparent" : ANSWER[k].color, borderColor: ANSWER[k].color }} />{ANSWER[k].label}</span>
          ))}
        </div>
        <div className="hm-dow">{["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}</div>
        {weeks.map((w) => {
          const lanes = lanesFor(shown, w);
          const hidden = lanes.slice(MAX).flat();
          return (
            <div className="hm-week" key={isoOf(w)}>
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(w, i), s = isoOf(d);
                const out = d.getMonth() !== month.getMonth();
                const more = hidden.filter((x) => x.from <= i && x.to >= i).length;
                return (
                  <button key={s} className={"hm-day" + (out ? " out" : "") + (s === todayIso() ? " today" : "") + (s === day ? " sel" : "")}
                    style={{ gridColumn: i + 1 }} onClick={() => setDay(s)}>
                    {d.getDate()}
                    {more > 0 && <small>+{more}</small>}
                  </button>
                );
              })}
              {lanes.slice(0, MAX).map((lane, li) => lane.map(({ ev, from, to, cutLeft, cutRight }) => {
                const k = answerOf(ev, me), a = ANSWER[k];
                return (
                  <button key={ev.id + li} className={"hm-bar" + (k === "none" ? " none" : "") + (cutLeft ? " cl" : "") + (cutRight ? " cr" : "")}
                    style={{ gridColumn: `${from + 1} / ${to + 2}`, gridRow: li + 2, "--a": a.color, "--s": a.soft }}
                    title={ev.title} onClick={() => onOpen(ev.id)}>
                    {/* Le titre seul : dans 50 px de large, l'emoji mangeait la moitié du mot. */}
                    {ev.title}
                  </button>
                );
              }))}
            </div>
          );
        })}
      </section>

      <section className="hm-dayl">
        <h3 className="hm-month">{parse(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())}</h3>
        {dayEvents.length === 0 ? <p className="hm-empty">Rien ce jour-là.</p>
          : dayEvents.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} />)}
        {undated.length > 0 && (
          <>
            <h3 className="hm-month">Date à voter</h3>
            {undated.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} />)}
          </>
        )}
      </section>
    </>
  );
}

export default function Home({ events, filtered, me, group, onOpen, onRsvp, cityBar = null }) {
  const [tab, setTab] = useState("list");
  return (
    <div className="hm">
      <style>{CSS}</style>
      <ToPlay events={events} me={me} onOpen={onOpen} onRsvp={onRsvp} />
      <div className="seg hm-tabs">
        <button className={tab === "list" ? "on" : ""} onClick={() => setTab("list")}>Liste</button>
        <button className={tab === "cal" ? "on" : ""} onClick={() => setTab("cal")}>Calendrier</button>
      </div>
      {/* Le filtre de ville ne vaut que pour la liste : le calendrier est ton
          emploi du temps, toutes villes confondues. */}
      {tab === "list" ? <>{cityBar}<Agenda events={filtered} me={me} group={group} onOpen={onOpen} /></>
        : <Calendar events={events} me={me} group={group} onOpen={onOpen} />}
    </div>
  );
}

const CSS = `
.hm-done{background:#ECFDF5;color:#166534;border-radius:14px;padding:11px 14px;font-weight:600;font-size:13.5px;margin-bottom:14px;}
.hm-play{background:var(--card);border:1.5px solid var(--accent);border-radius:16px;padding:12px 12px 6px;margin-bottom:16px;}
.hm-play h2{display:flex;align-items:center;gap:8px;font-family:'Bricolage Grotesque';font-size:16px;font-weight:800;margin:0 0 6px 2px;}
.hm-play h2 span{background:var(--accent);color:#fff;border-radius:10px;font-size:12px;padding:2px 8px;}
.hm-play-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 2px;border:0;border-top:1px solid var(--line);background:none;text-align:left;color:var(--ink);}
.hm-play-item{display:flex;align-items:center;gap:6px;border-top:1px solid var(--line);}
.hm-play-item .hm-play-row{flex:1;min-width:0;}
.hm-play-item:first-of-type{border-top:0;}
.hm-play-item .hm-play-row{border-top:0;}
/* Trois pastilles de 30 px : assez pour le pouce, assez petites pour ne
   pas transformer le bloc en formulaire. */
.hm-quick{display:flex;gap:5px;flex-shrink:0;}
.hm-quick button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;border-radius:50%;
  border:1.5px solid color-mix(in srgb, var(--a) 45%, transparent);background:none;color:var(--a);}
.hm-quick button:active{background:var(--a);border-color:var(--a);color:#fff;}
.hm-play-ic{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;background:var(--accent-soft);color:var(--accent);flex-shrink:0;}
.hm-play-txt{flex:1;min-width:0;display:flex;flex-direction:column;}
.hm-play-txt b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hm-play-txt em{font-style:normal;font-size:12.5px;color:var(--accent);font-weight:600;}
.hm-more{width:100%;border:0;background:none;color:var(--muted);font-weight:600;font-size:12.5px;padding:8px;}

.hm-month{display:flex;align-items:center;gap:6px;width:100%;padding:0;border:0;background:none;text-align:left;
  font-family:'Bricolage Grotesque';font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:18px 2px 8px;}
.hm-month svg{transition:transform .15s;}
.hm-month.shut svg{transform:rotate(-90deg);}
.hm-month span{font-family:Inter,system-ui;font-size:11px;font-weight:700;letter-spacing:0;padding:1px 7px;border-radius:9px;background:var(--line);color:var(--muted);}
.hm-month.shut{margin-bottom:4px;}
.hm-agenda section:first-child .hm-month{margin-top:4px;}
.hm-row{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;margin-bottom:6px;background:var(--card);border:1px solid var(--line);border-radius:14px;text-align:left;color:var(--ink);scroll-margin:120px;}
.hm-row.past{opacity:.55;}
.hm-date{display:flex;flex-direction:column;align-items:center;justify-content:center;width:42px;flex-shrink:0;color:var(--ink);}
.hm-date b{font-family:'Bricolage Grotesque';font-size:21px;font-weight:800;line-height:1;}
.hm-date b small{font-size:12px;font-weight:700;}
.hm-date em{font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase;margin-top:2px;}
.hm-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.hm-body b{font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.hm-body em{font-style:normal;font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden;}
.hm-unread{margin-left:6px;padding:0 6px;border-radius:8px;background:var(--accent-soft);color:var(--accent);font-weight:700;}
.hm-ans{flex-shrink:0;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:20px;border:1.5px solid;}
.hm-past{display:flex;align-items:center;gap:6px;width:100%;margin:14px 0 8px;padding:10px 12px;border:1.5px dashed var(--line);border-radius:12px;background:none;color:var(--muted);font-weight:600;font-size:13px;}
.hm-empty{color:var(--muted);font-size:13.5px;padding:6px 2px;}

.hm-cal{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 8px 10px;}
.hm-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.hm-cal-head h2{font-family:'Bricolage Grotesque';font-size:18px;font-weight:800;}
.hm-cal-head button{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);}
.hm-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11.5px;color:var(--muted);margin:4px 4px 6px;}
.hm-legend span{display:flex;align-items:center;gap:5px;}
.hm-legend i{width:10px;height:10px;border-radius:3px;border:1.5px solid;}
.hm-dow{display:grid;grid-template-columns:repeat(7,1fr);font-size:11px;font-weight:700;color:var(--muted);text-align:center;margin-bottom:2px;}
.hm-week{display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:auto;row-gap:2px;padding-bottom:4px;border-top:1px solid var(--line);min-height:62px;align-content:start;}
.hm-day{grid-row:1;display:flex;align-items:center;justify-content:center;gap:2px;height:24px;margin:2px auto 0;min-width:24px;border:0;border-radius:12px;background:none;font-size:12.5px;font-weight:600;color:var(--ink);}
.hm-day small{font-size:9px;color:var(--muted);}
.hm-day.out{color:#C9C3B6;}
.hm-day.today{background:var(--ink);color:#fff;}
.hm-day.sel{outline:2px solid var(--accent);}
.hm-bar{height:17px;margin:0 1px;padding:0 4px;border:0;border-radius:5px;background:var(--a);color:#fff;font-size:10.5px;font-weight:600;text-align:left;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:17px;}
.hm-bar.none{background:var(--s);color:#475569;border:1.5px dashed var(--a);line-height:14px;}
.hm-bar.cl{border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}
.hm-bar.cr{border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}
.hm-dayl{margin-top:6px;}
.hm-tabs{margin:0 0 14px;}

`;

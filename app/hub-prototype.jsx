"use client";

/* ==================================================================== *
 *  PROTOTYPE — à jeter une fois une variante choisie.
 *
 *  Question : comment alléger l'accueil quand les events s'accumulent ?
 *  Quatre accueils sur la route existante, ?variant=A|B|C|D, avec les
 *  vrais events du groupe. Lecture seule : toucher un event ouvre la
 *  vraie fiche, rien d'autre n'écrit.
 *
 *    A  l'actuel, pour comparer
 *    B  Agenda : « À toi de jouer », puis intercalaires par mois
 *    C  Calendrier perso : le mois, coloré selon ta réponse
 *    D  Bandeau + agenda : 5 semaines en frise, l'agenda dessous
 *
 *  Visible en dev et sur les versions de test, jamais en prod.
 * ==================================================================== */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, CalendarClock, MapPinned, Users, Hand } from "lucide-react";

import { categoryOf } from "@/lib/catalog";
import { cityEmoji } from "@/lib/group";

export const VARIANTS = [
  ["A", "Actuel"],
  ["B", "Agenda"],
  ["C", "Calendrier perso"],
  ["D", "Bandeau + agenda"],
];

export const prototypeOn = process.env.NODE_ENV !== "production" || process.env.HUB_STAGE === "preview";

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
 * date ou de lieu où tu n'as pas voté, sinon une réponse que tu n'as pas
 * donnée. Un seul motif par event, le plus urgent.
 */
function toPlay(events, me) {
  return events
    .filter((ev) => !isPast(ev))
    .flatMap((ev) => {
      const votedDate = (ev.datePoll || []).some((o) => o.votes.includes(me));
      const votedPlace = (ev.placePoll || []).some((o) => o.votes.includes(me));
      if (!ev.date && (ev.datePoll || []).length > 0 && !votedDate) return [{ ev, why: "Vote pour la date", icon: CalendarClock }];
      if (!ev.place && (ev.placePoll || []).length > 0 && !votedPlace) return [{ ev, why: "Vote pour le lieu", icon: MapPinned }];
      if (!ev.rsvps?.[me]) return [{ ev, why: "Tu viens ?", icon: Hand }];
      return [];
    })
    .sort((a, b) => (a.ev.date || "9999").localeCompare(b.ev.date || "9999"));
}

// ---------- briques communes ----------
function ToPlay({ events, me, onOpen }) {
  const items = useMemo(() => toPlay(events, me), [events, me]);
  const [all, setAll] = useState(false);
  if (items.length === 0) return <div className="px-done">Tu es à jour sur tous les plans 👌</div>;
  const shown = all ? items : items.slice(0, 3);
  return (
    <section className="px-play">
      <h2>À toi de jouer <span>{items.length}</span></h2>
      {shown.map(({ ev, why, icon: Icon }) => (
        <button key={ev.id} className="px-play-row" onClick={() => onOpen(ev.id)}>
          <span className="px-play-ic"><Icon size={15} /></span>
          <span className="px-play-txt"><b>{ev.title}</b><em>{why}</em></span>
          <ChevronRight size={16} />
        </button>
      ))}
      {items.length > 3 && (
        <button className="px-more" onClick={() => setAll(!all)}>{all ? "Moins" : `Voir les ${items.length - 3} autres`}</button>
      )}
    </section>
  );
}

/** Une ligne d'agenda : la date en gros, une ligne de détails, ta réponse. */
function Row({ ev, me, group, onOpen, id }) {
  const cat = categoryOf(ev.category);
  const a = ANSWER[answerOf(ev, me)];
  const multi = ev.endDate && ev.endDate !== ev.date;
  return (
    <button className={"px-row" + (isPast(ev) ? " past" : "")} id={id} onClick={() => onOpen(ev.id)}>
      <span className="px-date">
        {ev.date ? (
          <>
            <b>{parse(ev.date).getDate()}{multi && <small>–{parse(ev.endDate).getDate()}</small>}</b>
            <em>{dayShort(ev.date)}</em>
          </>
        ) : <CalendarClock size={18} />}
      </span>
      <span className="px-body">
        <b>{ev.title}</b>
        <em>
          {cat.emoji}
          {ev.city && <> · {cityEmoji(group.cities, ev.city)} {ev.city}</>}
          {ev.time && <> · {ev.time}</>}
          <> · <Users size={11} /> {going(ev)}</>
        </em>
      </span>
      <span className="px-ans" style={{ color: a.color, background: a.soft, borderStyle: answerOf(ev, me) === "none" ? "dashed" : "solid", borderColor: a.color }}>
        {a.short}
      </span>
    </button>
  );
}

/** L'agenda : intercalaires par mois, les dates à voter à la fin, le passé replié. */
function Agenda({ events, me, group, onOpen, anchors = false }) {
  const [showPast, setShowPast] = useState(false);
  const up = events.filter((e) => e.date && !isPast(e)).sort((a, b) => a.date.localeCompare(b.date));
  const undated = events.filter((e) => !e.date);
  const past = events.filter(isPast).sort((a, b) => b.date.localeCompare(a.date));
  const thisYear = new Date().getFullYear();

  const months = [];
  for (const ev of up) {
    const key = ev.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last?.key === key) last.items.push(ev);
    else months.push({ key, label: monthLabel(parse(ev.date), parse(ev.date).getFullYear() !== thisYear), items: [ev] });
  }
  // Pour le bandeau : une ancre sur le premier event de chaque jour.
  const seen = new Set();
  const anchorOf = (ev) => {
    if (!anchors || seen.has(ev.date)) return undefined;
    seen.add(ev.date);
    return `px-day-${ev.date}`;
  };

  return (
    <div className="px-agenda">
      {months.length === 0 && undated.length === 0 && <p className="px-empty">Rien de prévu ici.</p>}
      {months.map((m) => (
        <section key={m.key}>
          <h3 className="px-month">{m.label}</h3>
          {m.items.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} id={anchorOf(ev)} />)}
        </section>
      ))}
      {undated.length > 0 && (
        <section>
          <h3 className="px-month">Date à voter</h3>
          {undated.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} />)}
        </section>
      )}
      {past.length > 0 && (
        <>
          <button className="px-past" onClick={() => setShowPast(!showPast)}>
            <ChevronDown size={15} style={{ transform: showPast ? "rotate(180deg)" : "" }} /> Passés ({past.length})
          </button>
          {showPast && past.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} />)}
        </>
      )}
    </div>
  );
}

// ---------- B : agenda ----------
function VariantB({ events, filtered, me, group, onOpen }) {
  return (
    <>
      <ToPlay events={events} me={me} onOpen={onOpen} />
      <Agenda events={filtered} me={me} group={group} onOpen={onOpen} />
    </>
  );
}

// ---------- C : calendrier perso ----------
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

function VariantC({ events, me, group, onOpen }) {
  const [mine, setMine] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(todayIso());
  const shown = mine ? events.filter((e) => ["in", "maybe"].includes(answerOf(e, me))) : events;

  const first = mondayOf(month);
  const last = addDays(new Date(month.getFullYear(), month.getMonth() + 1, 1), -1);
  const weeks = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(w);
  const MAX = 3;

  const dayEvents = shown.filter((e) => e.date && e.date <= day && endOf(e) >= day);
  const undated = shown.filter((e) => !e.date && !isPast(e));

  return (
    <>
      <ToPlay events={events} me={me} onOpen={onOpen} />
      <section className="px-cal">
        <div className="px-cal-head">
          <button aria-label="Mois précédent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
          <h2>{monthLabel(month, true)}</h2>
          <button aria-label="Mois suivant" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
        </div>
        <div className="px-legend">
          {["in", "maybe", "out", "none"].map((k) => (
            <span key={k}><i style={{ background: k === "none" ? "transparent" : ANSWER[k].color, borderColor: ANSWER[k].color }} />{ANSWER[k].label}</span>
          ))}
        </div>
        <label className="px-mine"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Seulement mes plans (vert et orange)</label>
        <div className="px-dow">{["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}</div>
        {weeks.map((w) => {
          const lanes = lanesFor(shown, w);
          const hidden = lanes.slice(MAX).flat();
          return (
            <div className="px-week" key={isoOf(w)}>
              {Array.from({ length: 7 }, (_, i) => {
                const d = addDays(w, i), s = isoOf(d);
                const out = d.getMonth() !== month.getMonth();
                const more = hidden.filter((x) => x.from <= i && x.to >= i).length;
                return (
                  <button key={s} className={"px-day" + (out ? " out" : "") + (s === todayIso() ? " today" : "") + (s === day ? " sel" : "")}
                    style={{ gridColumn: i + 1 }} onClick={() => setDay(s)}>
                    {d.getDate()}
                    {more > 0 && <small>+{more}</small>}
                  </button>
                );
              })}
              {lanes.slice(0, MAX).map((lane, li) => lane.map(({ ev, from, to, cutLeft, cutRight }) => {
                const k = answerOf(ev, me), a = ANSWER[k];
                return (
                  <button key={ev.id + li} className={"px-bar" + (k === "none" ? " none" : "") + (cutLeft ? " cl" : "") + (cutRight ? " cr" : "")}
                    style={{ gridColumn: `${from + 1} / ${to + 2}`, gridRow: li + 2, "--a": a.color, "--s": a.soft }}
                    title={ev.title} onClick={() => onOpen(ev.id)}>
                    {categoryOf(ev.category).emoji} {ev.title}
                  </button>
                );
              }))}
            </div>
          );
        })}
      </section>

      <section className="px-dayl">
        <h3 className="px-month">{parse(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, (c) => c.toUpperCase())}</h3>
        {dayEvents.length === 0 ? <p className="px-empty">Rien ce jour-là{mine ? " pour toi" : ""}.</p>
          : dayEvents.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} />)}
        {undated.length > 0 && (
          <>
            <h3 className="px-month">Date à voter</h3>
            {undated.map((ev) => <Row key={ev.id} ev={ev} me={me} group={group} onOpen={onOpen} />)}
          </>
        )}
      </section>
    </>
  );
}

// ---------- D : bandeau + agenda ----------
function VariantD({ events, filtered, me, group, onOpen }) {
  const start = mondayOf(new Date());
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const [sel, setSel] = useState("");
  const strip = useRef(null);

  // Le bandeau s'ouvre sur aujourd'hui.
  useEffect(() => {
    strip.current?.querySelector(".today")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, []);

  const jump = (s) => {
    setSel(s);
    // Le premier event de ce jour, ou le suivant s'il n'y a rien ce jour-là.
    const target = filtered.filter((e) => e.date && !isPast(e) && endOf(e) >= s).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (target) document.getElementById(`px-day-${target.date}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <ToPlay events={events} me={me} onOpen={onOpen} />
      <div className="px-strip" ref={strip}>
        {days.map((d, i) => {
          const s = isoOf(d);
          const on = events.filter((e) => e.date && e.date <= s && endOf(e) >= s);
          return (
            <React.Fragment key={s}>
              {(i === 0 || d.getDate() === 1) && <span className="px-strip-m">{monthLabel(d).slice(0, 4)}.</span>}
              <button className={"px-sday" + (s === todayIso() ? " today" : "") + (s === sel ? " sel" : "") + (d.getDay() % 6 === 0 ? " we" : "")} onClick={() => jump(s)}>
                <em>{dayShort(s).slice(0, 2)}</em>
                <b>{d.getDate()}</b>
                <span className="px-dots">
                  {on.slice(0, 3).map((e) => {
                    const k = answerOf(e, me);
                    return <i key={e.id} style={{ background: k === "none" ? "transparent" : ANSWER[k].color, borderColor: ANSWER[k].color }} />;
                  })}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <Agenda events={filtered} me={me} group={group} onOpen={onOpen} anchors />
    </>
  );
}

export default function HubPrototype({ variant, ...props }) {
  return (
    <div className="px">
      <style>{CSS}</style>
      {variant === "B" && <VariantB {...props} />}
      {variant === "C" && <VariantC {...props} />}
      {variant === "D" && <VariantD {...props} />}
    </div>
  );
}

// ---------- la barre de bascule ----------
/**
 * Hors de la maquette : une pilule sombre au-dessus du bouton « Ajouter ».
 * Les flèches du clavier font défiler aussi, sauf dans un champ.
 */
export function PrototypeSwitcher({ current, onChange }) {
  const i = VARIANTS.findIndex(([k]) => k === current);
  const go = (d) => onChange(VARIANTS[(i + d + VARIANTS.length) % VARIANTS.length][0]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="px-switch">
      <style>{SWITCH_CSS}</style>
      <button aria-label="Variante précédente" onClick={() => go(-1)}><ChevronLeft size={16} /></button>
      <span>{VARIANTS[i]?.[0]} · {VARIANTS[i]?.[1]}</span>
      <button aria-label="Variante suivante" onClick={() => go(1)}><ChevronRight size={16} /></button>
    </div>
  );
}

const SWITCH_CSS = `
.px-switch{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(86px + env(safe-area-inset-bottom));z-index:60;
  display:flex;align-items:center;gap:6px;padding:5px;border-radius:30px;background:#111;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.3);
  font:600 12.5px/1 system-ui,sans-serif;white-space:nowrap;}
.px-switch button{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;border:0;background:#333;color:#fff;}
.px-switch span{padding:0 6px;}
`;

const CSS = `
.px-done{background:#ECFDF5;color:#166534;border-radius:14px;padding:11px 14px;font-weight:600;font-size:13.5px;margin-bottom:14px;}
.px-play{background:var(--card);border:1.5px solid var(--accent);border-radius:16px;padding:12px 12px 6px;margin-bottom:16px;}
.px-play h2{display:flex;align-items:center;gap:8px;font-family:'Bricolage Grotesque',system-ui;font-size:16px;font-weight:800;margin:0 0 6px 2px;}
.px-play h2 span{background:var(--accent);color:#fff;border-radius:10px;font-size:12px;padding:2px 8px;}
.px-play-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 2px;border:0;border-top:1px solid var(--line);background:none;text-align:left;color:var(--ink);}
.px-play-row:first-of-type{border-top:0;}
.px-play-ic{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:10px;background:var(--accent-soft);color:var(--accent);flex-shrink:0;}
.px-play-txt{flex:1;min-width:0;display:flex;flex-direction:column;}
.px-play-txt b{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.px-play-txt em{font-style:normal;font-size:12.5px;color:var(--accent);font-weight:600;}
.px-more{width:100%;border:0;background:none;color:var(--muted);font-weight:600;font-size:12.5px;padding:8px;}

.px-month{font-family:'Bricolage Grotesque',system-ui;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:18px 2px 8px;}
.px-agenda section:first-child .px-month{margin-top:4px;}
.px-row{display:flex;align-items:center;gap:12px;width:100%;padding:10px 12px;margin-bottom:6px;background:var(--card);border:1px solid var(--line);border-radius:14px;text-align:left;color:var(--ink);scroll-margin:120px;}
.px-row.past{opacity:.55;}
.px-date{display:flex;flex-direction:column;align-items:center;justify-content:center;width:42px;flex-shrink:0;color:var(--ink);}
.px-date b{font-family:'Bricolage Grotesque',system-ui;font-size:21px;font-weight:800;line-height:1;}
.px-date b small{font-size:12px;font-weight:700;}
.px-date em{font-style:normal;font-size:11px;color:var(--muted);text-transform:uppercase;margin-top:2px;}
.px-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.px-body b{font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.px-body em{font-style:normal;font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden;}
.px-ans{flex-shrink:0;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:20px;border:1.5px solid;}
.px-past{display:flex;align-items:center;gap:6px;width:100%;margin:14px 0 8px;padding:10px 12px;border:1.5px dashed var(--line);border-radius:12px;background:none;color:var(--muted);font-weight:600;font-size:13px;}
.px-empty{color:var(--muted);font-size:13.5px;padding:6px 2px;}

.px-cal{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 8px 10px;}
.px-cal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.px-cal-head h2{font-family:'Bricolage Grotesque',system-ui;font-size:18px;font-weight:800;}
.px-cal-head button{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);}
.px-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11.5px;color:var(--muted);margin:4px 4px 6px;}
.px-legend span{display:flex;align-items:center;gap:5px;}
.px-legend i{width:10px;height:10px;border-radius:3px;border:1.5px solid;}
.px-mine{display:flex;align-items:center;gap:7px;font-size:12.5px;margin:2px 4px 8px;color:var(--ink);}
.px-dow{display:grid;grid-template-columns:repeat(7,1fr);font-size:11px;font-weight:700;color:var(--muted);text-align:center;margin-bottom:2px;}
.px-week{display:grid;grid-template-columns:repeat(7,1fr);grid-auto-rows:auto;row-gap:2px;padding-bottom:4px;border-top:1px solid var(--line);min-height:62px;align-content:start;}
.px-day{grid-row:1;display:flex;align-items:center;justify-content:center;gap:2px;height:24px;margin:2px auto 0;min-width:24px;border:0;border-radius:12px;background:none;font-size:12.5px;font-weight:600;color:var(--ink);}
.px-day small{font-size:9px;color:var(--muted);}
.px-day.out{color:#C9C3B6;}
.px-day.today{background:var(--ink);color:#fff;}
.px-day.sel{outline:2px solid var(--accent);}
.px-bar{height:17px;margin:0 1px;padding:0 4px;border:0;border-radius:5px;background:var(--a);color:#fff;font-size:10.5px;font-weight:600;text-align:left;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:17px;}
.px-bar.none{background:var(--s);color:#475569;border:1.5px dashed var(--a);line-height:14px;}
.px-bar.cl{border-top-left-radius:0;border-bottom-left-radius:0;margin-left:0;}
.px-bar.cr{border-top-right-radius:0;border-bottom-right-radius:0;margin-right:0;}
.px-dayl{margin-top:6px;}

.px-strip{display:flex;align-items:flex-end;gap:5px;overflow-x:auto;margin:0 -18px 6px;padding:2px 18px 8px;scrollbar-width:none;}
.px-strip::-webkit-scrollbar{display:none;}
.px-strip-m{flex-shrink:0;align-self:center;writing-mode:vertical-rl;transform:rotate(180deg);font-size:10.5px;font-weight:800;text-transform:uppercase;color:var(--muted);}
.px-sday{flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:2px;width:44px;padding:7px 0 6px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);}
.px-sday.we{background:#F7F5F0;}
.px-sday em{font-style:normal;font-size:10.5px;color:var(--muted);text-transform:uppercase;}
.px-sday b{font-family:'Bricolage Grotesque',system-ui;font-size:17px;font-weight:800;line-height:1;}
.px-sday.today{border-color:var(--ink);border-width:2px;}
.px-sday.sel{background:var(--ink);color:#fff;}
.px-sday.sel em{color:#ddd;}
.px-dots{display:flex;gap:2px;height:7px;}
.px-dots i{width:7px;height:7px;border-radius:50%;border:1.5px solid;}
`;

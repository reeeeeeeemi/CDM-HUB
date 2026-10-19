"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, X } from "lucide-react";

import type { City } from "@/lib/group";

type Hit = { id: number; name: string; region: string; country: string; flag: string };

/** « FR » → 🇫🇷 : deux lettres régionales, que les téléphones dessinent en drapeau. */
const flagOf = (code?: string) =>
  code && /^[A-Za-z]{2}$/.test(code)
    ? String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "📍";

// Sans accents ni majuscules : « Beziers » trouve « Béziers ».
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Cherche une ville dans le monde entier, par le géocodage d'Open-Meteo :
 * gratuit, sans clé, en français. Seul le texte tapé part chez eux.
 *
 * Les villes les plus peuplées d'abord, et celles dont le nom commence par
 * ce qu'on tape avant les ressemblances lointaines — « Lyo » donne Lyon,
 * pas un hameau d'Estonie.
 */
async function search(q: string, signal: AbortSignal): Promise<Hit[]> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=fr&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: { id: number; name: string; admin1?: string; country?: string; country_code?: string; population?: number }[];
  };
  const needle = fold(q);
  return (data.results ?? [])
    .map((r) => ({ r, prefix: fold(r.name).startsWith(needle) }))
    .sort((a, b) => Number(b.prefix) - Number(a.prefix) || (b.r.population ?? 0) - (a.r.population ?? 0))
    .slice(0, 6)
    .map(({ r }) => ({
      id: r.id,
      name: r.name,
      region: [r.admin1, r.country].filter(Boolean).join(", "),
      country: r.country ?? "",
      flag: flagOf(r.country_code),
    }));
}

/**
 * Les villes d'un groupe : une recherche, et les villes retenues en
 * pastilles. L'emoji d'une pastille se retouche sur place — le drapeau
 * n'est qu'un point de départ, 🌸 dit mieux Toulouse.
 */
export default function CitySearch({ cities, onChange }: { cities: City[]; onChange: (c: City[]) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Une requête par pause de frappe, et la précédente annulée : taper vite
  // ne doit pas afficher la réponse d'un mot déjà effacé.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        setHits(await search(term, ctrl.signal));
      } catch {
        // Hors ligne ou service indisponible : il reste l'ajout à la main.
        if (!ctrl.signal.aborted) setHits([]);
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  // Un toucher hors de la liste la referme.
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const has = (name: string) => cities.some((c) => fold(c.name) === fold(name));

  const add = (name: string, emoji: string) => {
    const n = name.trim();
    if (!n || has(n)) return;
    onChange([...cities, { name: n, emoji }]);
    setQ("");
    setHits([]);
    setOpen(false);
  };

  const term = q.trim();
  const shown = term.length >= 2 ? hits.filter((h) => !has(h.name)) : [];
  const exact = shown.some((h) => fold(h.name) === fold(term));

  return (
    <div className="cs">
      {cities.length > 0 && (
        <div className="cs-chips">
          {cities.map((c, i) => (
            <span className="cs-chip" key={c.name}>
              <input className="cs-emoji" value={c.emoji} maxLength={8} aria-label={`Emoji de ${c.name}`}
                onChange={(e) => onChange(cities.map((x, j) => (j === i ? { ...x, emoji: e.target.value } : x)))}
                onBlur={(e) => !e.target.value.trim() && onChange(cities.map((x, j) => (j === i ? { ...x, emoji: "📍" } : x)))} />
              {c.name}
              <button type="button" aria-label={`Retirer ${c.name}`} onClick={() => onChange(cities.filter((_, j) => j !== i))}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="cs-box" ref={box}>
        <MapPin size={16} className="cs-ic" />
        <input value={q} placeholder="Chercher une ville…" aria-label="Chercher une ville" autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); if (e.target.value.trim().length < 2) setHits([]); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") { e.preventDefault(); if (shown[0]) add(shown[0].name, shown[0].flag); else add(term, "📍"); }
          }} />
        {open && term.length >= 2 && (
          <div className="cs-list" role="listbox">
            {busy && shown.length === 0 && <p className="cs-hint">Recherche…</p>}
            {shown.map((h) => (
              <button key={h.id} type="button" role="option" aria-selected={false} className="cs-item" onClick={() => add(h.name, h.flag)}>
                <span className="cs-flag">{h.flag}</span>
                <span><b>{h.name}</b>{h.region && <em>{h.region}</em>}</span>
              </button>
            ))}
            {!busy && !exact && !has(term) && (
              <button type="button" className="cs-item free" onClick={() => add(term, "📍")}>
                <Plus size={15} /> <span>Ajouter « {term} »</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

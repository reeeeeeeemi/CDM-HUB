"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Users, MapPin, Shapes, Plus, X } from "lucide-react";

import { CATEGORIES, FAMILIES, MAX_CATEGORIES, MIN_CATEGORIES } from "@/lib/catalog";
import type { City } from "@/lib/group";
import type { NewGroup } from "@/lib/actions/group";

type Props = {
  /** Le dernier pseudo utilisé, proposé d'office. */
  pseudo: string;
  /** Sans groupe, il n'y a pas d'accueil où revenir. */
  canGoBack: boolean;
  onCreate: (g: NewGroup) => Promise<{ error?: string }>;
};

/**
 * Le groupe en trois temps, sur une seule page : qui on est, où l'on vit,
 * ce qu'on fait ensemble. Les catégories viennent en dernier — c'est le
 * seul choix qui demande de parcourir une liste.
 */
export default function NewGroupForm({ pseudo, canGoBack, onCreate }: Props) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [nick, setNick] = useState(pseudo);
  const [tagline, setTagline] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [cityName, setCityName] = useState("");
  const [cityEmoji, setCityEmoji] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const full = picked.length >= MAX_CATEGORIES;

  const toggle = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : full ? p : [...p, k]));

  const addCity = () => {
    const n = cityName.trim();
    if (!n || cities.some((c) => c.name.toLowerCase() === n.toLowerCase())) return;
    setCities([...cities, { name: n, emoji: cityEmoji.trim() || "📍" }]);
    setCityName("");
    setCityEmoji("");
  };

  // Le bouton dit ce qui manque, plutôt que de rester grisé sans raison.
  const missing = !name.trim()
    ? "Donne un nom au groupe"
    : nick.trim().length < 2
      ? "Choisis ton pseudo"
      : picked.length < MIN_CATEGORIES
        ? `Choisis encore ${MIN_CATEGORIES - picked.length} catégorie${MIN_CATEGORIES - picked.length > 1 ? "s" : ""}`
        : "";

  const submit = () =>
    start(async () => {
      setErr("");
      // En cas de succès, l'action redirige vers le nouveau groupe.
      const r = await onCreate({ name, emoji, tagline, pseudo: nick, cities, categories: picked });
      if (r?.error) setErr(r.error);
    });

  return (
    <div className="rg">
      <header className="rg-head">
        {canGoBack && (
          <Link className="rg-back" href="/" aria-label="Revenir au hub">
            <ChevronLeft size={19} strokeWidth={2.4} />
          </Link>
        )}
        <h1>Nouveau groupe</h1>
      </header>

      {err && <p className="rg-err" role="alert">{err}</p>}

      <section className="rg-sec">
        <h2><Users size={16} /> Le groupe</h2>
        <div className="ng-name">
          <label className="rg-field ng-emoji"><span>Emoji</span>
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🎉" maxLength={8} aria-label="Emoji du groupe (facultatif)" />
          </label>
          <label className="rg-field"><span>Nom</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ex. Les Bouyaves" autoFocus />
          </label>
        </div>
        <label className="rg-field"><span>Ton pseudo dans ce groupe</span>
          <input value={nick} onChange={(e) => setNick(e.target.value)} maxLength={40} autoComplete="nickname" />
        </label>
        <label className="rg-field"><span>Phrase d&apos;accueil <em>· facultatif</em></span>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={280} placeholder="Ce qui réunit la bande, en une phrase" />
        </label>
      </section>

      <section className="rg-sec">
        <h2><MapPin size={16} /> Vos villes <em className="ng-opt">· facultatif</em></h2>
        <p className="rg-hint">Elles servent à filtrer les plans du quotidien. Sans ville, tout s&apos;affiche ensemble.</p>
        {cities.length > 0 && (
          <div className="rg-chips ng-cities">
            {cities.map((c) => (
              <span className="rg-chip on ng-city" key={c.name}>
                {c.emoji} {c.name}
                <button type="button" aria-label={`Retirer ${c.name}`} onClick={() => setCities(cities.filter((x) => x.name !== c.name))}><X size={13} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="ng-name rg-field">
          <input className="ng-emoji" value={cityEmoji} onChange={(e) => setCityEmoji(e.target.value)} placeholder="📍" maxLength={8} aria-label="Emoji de la ville" />
          <input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="Ex. Lyon"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCity(); } }} aria-label="Ville" />
          <button type="button" className="rg-btn sm" onClick={addCity} disabled={!cityName.trim()} aria-label="Ajouter la ville"><Plus size={16} /></button>
        </div>
      </section>

      <section className="rg-sec">
        <h2><Shapes size={16} /> Ce que vous faites ensemble</h2>
        <p className="rg-hint">
          De {MIN_CATEGORIES} à {MAX_CATEGORIES} catégories — « Autre » s&apos;y ajoute toujours.{" "}
          <b className={"ng-count" + (picked.length >= MIN_CATEGORIES ? " ok" : "")}>{picked.length} choisie{picked.length > 1 ? "s" : ""}</b>
        </p>
        {FAMILIES.map((f) => (
          <div className="ng-family" key={f.label}>
            <h3>{f.label}</h3>
            <div className="rg-chips">
              {f.keys.map((k) => {
                const c = CATEGORIES[k];
                const on = picked.includes(k);
                return (
                  <button key={k} type="button" aria-pressed={on} disabled={!on && full}
                    className={"ng-cat" + (on ? " on" : "")} style={{ "--c": c.color } as React.CSSProperties}
                    onClick={() => toggle(k)}>
                    {c.emoji} {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <div className="ng-foot">
        <button className="ng-submit" disabled={Boolean(missing) || pending} onClick={submit}>
          {pending ? "Création…" : missing || "Créer le groupe"}
        </button>
      </div>
    </div>
  );
}

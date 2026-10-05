"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CITIES } from "@/lib/brand";
import {
  ChevronLeft, ChevronDown, Search, MapPin, KeyRound, Building, Pencil, Trash2, Plus, Copy, Navigation, X, Wifi,
} from "lucide-react";

type PlaceFields = { name: string; address: string; doorCode: string; access: string; wifi: string; city: string };
type Place = PlaceFields & { id: string; ownerId: string; owner: string; upcoming: number };

type Props = {
  viewer: { id: string; pseudo: string; city: string };
  places: Place[];
  onSave: (id: string | null, place: PlaceFields) => Promise<{ id?: string; error?: string }>;
  onDelete: (id: string) => Promise<{ error?: string }>;
};

const EMPTY: PlaceFields = { name: "", address: "", doorCode: "", access: "", wifi: "", city: "" };
const mapsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
// Sans accents ni majuscules : « Bezier » trouve « Béziers ».
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Le carnet des lieux. Une quinzaine d'adresses : on les range par
 * personne — « Chez moi » ne dit rien sans savoir chez qui — et une
 * recherche unique fouille noms, personnes et adresses. Chaque lieu tient
 * sur une ligne ; on l'ouvre pour lire le code ou lancer l'itinéraire.
 */
export default function Places({ viewer, places, onSave, onDelete }: Props) {
  const [list, setList] = useState<Place[]>(places);
  const [q, setQ] = useState("");
  // Comme l'onglet du quotidien : on part de sa propre ville.
  const [city, setCity] = useState(viewer.city || "all");
  const [openId, setOpenId] = useState<string | null>(null);
  // null : aucun formulaire ; "new" : ajout ; sinon l'id modifié.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlaceFields>(EMPTY);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(""), 2000);
  };

  const meId = viewer.id;
  // Les villes du groupe, plus celles qu'un lieu porterait hors liste.
  const cityChips = useMemo(() => {
    const extra = [...new Set(list.map((p) => p.city).filter((c) => c && !CITIES[c]))].sort();
    return [...Object.keys(CITIES), ...extra];
  }, [list]);
  // Les miens d'abord, puis les autres par ordre alphabétique de personne.
  const groups = useMemo(() => {
    const needle = fold(q.trim());
    const inCity = city === "all" ? list : list.filter((p) => p.city === city);
    const hits = needle
      ? inCity.filter((p) => [p.name, p.owner, p.address].some((v) => fold(v).includes(needle)))
      : inCity;
    const by = new Map<string, Place[]>();
    for (const p of hits) by.set(p.ownerId, [...(by.get(p.ownerId) ?? []), p]);
    return [...by.entries()]
      .map(([ownerId, ps]) => ({
        ownerId,
        owner: ownerId === meId ? "Mes lieux" : `Chez ${ps[0].owner}`,
        places: ps.sort((a, b) => a.name.localeCompare(b.name, "fr")),
      }))
      .sort((a, b) =>
        a.ownerId === meId ? -1 : b.ownerId === meId ? 1 : a.owner.localeCompare(b.owner, "fr"));
  }, [list, q, city, meId]);

  const startEdit = (p: Place | null) => {
    setEditing(p ? p.id : "new");
    // Un nouveau lieu prend la ville affichée, à défaut la sienne.
    setDraft(p ? { name: p.name, address: p.address, doorCode: p.doorCode, access: p.access, wifi: p.wifi, city: p.city } : { ...EMPTY, city: city !== "all" ? city : viewer.city });
  };

  const save = async () => {
    const id = editing === "new" ? null : editing;
    const r = await onSave(id, draft);
    if (r?.error || !r.id) { setErr(r?.error || "Impossible d'enregistrer."); return; }
    const clean = {
      name: draft.name.trim(), address: draft.address.trim(),
      doorCode: draft.doorCode.trim(), access: draft.access.trim(), wifi: draft.wifi.trim(),
      city: draft.city,
    };
    setList((prev) => id
      ? prev.map((p) => (p.id === id ? { ...p, ...clean } : p))
      : [...prev, { ...clean, id: r.id!, ownerId: viewer.id, owner: viewer.pseudo, upcoming: 0 }]);
    setEditing(null);
    setOpenId(r.id);
    flash("Lieu enregistré");
  };

  const remove = async (p: Place) => {
    // Les events gardent le nom du lieu ; seules l'adresse et le code partent.
    const n = p.upcoming;
    const warn = n > 0
      ? `${n} event${n > 1 ? "s" : ""} à venir s'y tien${n > 1 ? "nent" : "t"} : ${n > 1 ? "ils garderont" : "il gardera"} le nom, mais plus l'adresse ni le code.\n\n`
      : "";
    if (!window.confirm(`${warn}Supprimer « ${p.name} » ?`)) return;
    const r = await onDelete(p.id);
    if (r?.error) { setErr(r.error); return; }
    setList((prev) => prev.filter((x) => x.id !== p.id));
    flash("Lieu supprimé");
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${what} copié`);
    } catch {
      // Hors HTTPS le presse-papier est refusé : le code reste lisible à l'écran.
    }
  };

  return (
    <div className="rg">
      <header className="rg-head">
        <Link className="rg-back" href="/" aria-label="Revenir au hub">
          <ChevronLeft size={19} strokeWidth={2.4} />
        </Link>
        <h1>Nos lieux</h1>
      </header>

      {saved && <p className="rg-flash" role="status">{saved}</p>}
      {err && <p className="rg-err">{err}</p>}

      <div className="lx-search">
        <Search size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Un lieu, un pote, une rue…"
          aria-label="Chercher un lieu" />
        {q && <button type="button" aria-label="Effacer" onClick={() => setQ("")}><X size={15} /></button>}
      </div>

      <div className="lx-cities">
        <button className={"lx-city" + (city === "all" ? " on" : "")} onClick={() => setCity("all")}>Toutes</button>
        {cityChips.map((c) => (
          <button key={c} className={"lx-city" + (city === c ? " on" : "")} onClick={() => setCity(c)}>
            {CITIES[c] || "📍"} {c}
          </button>
        ))}
      </div>

      {editing === "new" ? (
        <PlaceForm draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <button className="lx-add" onClick={() => startEdit(null)}><Plus size={16} /> Ajouter un lieu</button>
      )}

      {groups.length === 0 && (
        <div className="lx-empty">
          <p className="rg-hint">
            {q ? "Aucun lieu ne correspond" : list.length ? "Aucun lieu" : "Aucun lieu pour l'instant. Ajoute chez toi pour commencer"}
            {city !== "all" && list.length > 0 ? ` à ${city}.` : "."}
          </p>
          {city !== "all" && list.length > 0 && (
            <button className="rg-btn" onClick={() => setCity("all")}>Voir toutes les villes</button>
          )}
        </div>
      )}

      {groups.map((g) => (
        <section className="lx-group" key={g.ownerId}>
          <h2>{g.owner}</h2>
          <div className="lx-list">
            {g.places.map((p) => editing === p.id ? (
              <PlaceForm key={p.id} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} />
            ) : (
              <div className={"lx-item" + (openId === p.id ? " open" : "")} key={p.id}>
                <button type="button" className="lx-row" aria-expanded={openId === p.id}
                  onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                  <span className="lx-name">
                    <b>{p.name}</b>
                    {(p.address || (city === "all" && p.city)) && (
                      <em>{city === "all" && p.city ? `${CITIES[p.city] || "📍"} ${p.city}${p.address ? " · " : ""}` : ""}{p.address}</em>
                    )}
                  </span>
                  <ChevronDown size={17} />
                </button>
                {openId === p.id && (
                  <div className="lx-details">
                    {p.doorCode && (
                      <div className="lx-code">
                        <KeyRound size={15} />
                        <span>Code</span>
                        <b>{p.doorCode}</b>
                        <button type="button" aria-label="Copier le code" onClick={() => copy(p.doorCode, "Code")}><Copy size={15} /></button>
                      </div>
                    )}
                    {p.wifi && (
                      <div className="lx-code wifi">
                        <Wifi size={15} />
                        <span>Wifi</span>
                        <b>{p.wifi}</b>
                        <button type="button" aria-label="Copier le wifi" onClick={() => copy(p.wifi, "Wifi")}><Copy size={15} /></button>
                      </div>
                    )}
                    {p.access && <div className="lx-line"><Building size={15} /> {p.access}</div>}
                    {p.address && (
                      <>
                        <div className="lx-line"><MapPin size={15} /> {p.address}</div>
                        <a className="lx-go" href={mapsUrl(p.address)} target="_blank" rel="noopener noreferrer">
                          <Navigation size={15} /> Itinéraire
                        </a>
                      </>
                    )}
                    {!p.doorCode && !p.access && !p.address && !p.wifi && <p className="rg-hint">Aucune info pour l&apos;instant.</p>}
                    {p.ownerId === viewer.id && (
                      <div className="lx-acts">
                        <button onClick={() => startEdit(p)}><Pencil size={14} /> Modifier</button>
                        <button className="danger" onClick={() => remove(p)}><Trash2 size={14} /> Supprimer</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function PlaceForm({ draft, setDraft, onSave, onCancel }: {
  draft: PlaceFields;
  setDraft: (d: PlaceFields) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (k: keyof PlaceFields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [k]: e.target.value });
  return (
    <div className="lx-form">
      <label className="rg-field"><span>Nom</span>
        <input value={draft.name} onChange={set("name")} placeholder="Ex. Chez moi, Maison d'Arcachon" maxLength={60} autoFocus />
      </label>
      <div className="rg-field"><span>Ville</span>
        <div className="lx-cities form">
          {Object.keys(CITIES).map((c) => (
            <button key={c} type="button" className={"lx-city" + (draft.city === c ? " on" : "")}
              onClick={() => setDraft({ ...draft, city: draft.city === c ? "" : c })}>{CITIES[c]} {c}</button>
          ))}
        </div>
      </div>
      <label className="rg-field"><span>Adresse</span>
        <input value={draft.address} onChange={set("address")} placeholder="12 rue des Lilas, 33000 Bordeaux" />
      </label>
      <div className="lx-row2">
        <label className="rg-field"><span>Code d&apos;entrée</span>
          <input value={draft.doorCode} onChange={set("doorCode")} placeholder="A1234" />
        </label>
        <label className="rg-field"><span>Étage / interphone</span>
          <input value={draft.access} onChange={set("access")} placeholder="3e, « Dupont »" />
        </label>
      </div>
      <label className="rg-field"><span>Wifi</span>
        <input value={draft.wifi} onChange={set("wifi")} placeholder="Livebox-12AB / motdepasse" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      </label>
      <div className="lx-acts">
        <button onClick={onCancel}>Annuler</button>
        <button className="primary" onClick={onSave} disabled={!draft.name.trim()}>Enregistrer</button>
      </div>
    </div>
  );
}

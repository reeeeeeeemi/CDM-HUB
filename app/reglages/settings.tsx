"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Bell, Users, UserPen, Link2, MapPin, House, Cake, KeyRound, Building, Pencil, Trash2, Plus } from "lucide-react";

import { CITIES } from "@/lib/brand";
import { usePush, PREFS } from "@/lib/use-push";

type Member = { id: string; pseudo: string; city: string };
type Prefs = Record<string, boolean>;
type PlaceFields = { name: string; address: string; doorCode: string; access: string };
type Place = PlaceFields & { id: string; ownerId: string; owner: string; upcoming: number };

const EMPTY_PLACE: PlaceFields = { name: "", address: "", doorCode: "", access: "" };
const mapsUrl = (address: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

type Props = {
  viewer: { id: string; email: string; pseudo: string };
  members: Member[];
  cities: string[];
  prefs: Prefs;
  onSetCities: (cities: string[]) => Promise<{ error?: string }>;
  onSetPrefs: (prefs: Prefs) => Promise<{ error?: string }>;
  onSetPseudo: (pseudo: string) => Promise<{ error?: string }>;
  onInvite: () => Promise<{ url?: string; error?: string }>;
  birthday: string;
  onSetBirthday: (date: string) => Promise<{ error?: string }>;
  places: Place[];
  onSavePlace: (id: string | null, place: PlaceFields) => Promise<{ id?: string; error?: string }>;
  onDeletePlace: (id: string) => Promise<{ error?: string }>;
};

export default function Settings({
  viewer, members, cities, prefs, onSetCities, onSetPrefs, onSetPseudo, onInvite,
  birthday, onSetBirthday, places, onSavePlace, onDeletePlace,
}: Props) {
  const push = usePush();

  // Optimiste partout : la case bascule tout de suite, l'écriture suit. Une
  // page de réglages qui attend le réseau à chaque clic est insupportable.
  const [picked, setPicked] = useState<string[]>(cities);
  const [flags, setFlags] = useState<Prefs>(prefs);
  const [name, setName] = useState(viewer.pseudo);
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const [invite, setInvite] = useState("");
  const [bday, setBday] = useState(birthday);
  const [list, setList] = useState<Place[]>(places);
  // null : aucun formulaire ouvert ; "new" : ajout ; sinon l'id modifié.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlaceFields>(EMPTY_PLACE);

  const flash = (msg: string) => {
    setSaved(msg);
    setTimeout(() => setSaved(""), 2000);
  };

  const toggleCity = (c: string) => {
    const next = picked.includes(c) ? picked.filter((x) => x !== c) : [...picked, c];
    setPicked(next);
    onSetCities(next).then((r) => (r?.error ? setErr(r.error) : flash("Villes enregistrées")));
  };

  const flip = (k: string) => {
    const next = { ...flags, [k]: !flags[k] };
    setFlags(next);
    // Un seul interrupteur part : deux onglets ouverts ne s'écrasent pas.
    onSetPrefs({ [k]: next[k] }).then((r) => (r?.error ? setErr(r.error) : flash("Enregistré")));
  };

  const saveName = async () => {
    const r = await onSetPseudo(name);
    if (r?.error) setErr(r.error);
    else flash("Blaze enregistré");
  };

  const saveBirthday = async () => {
    const r = await onSetBirthday(bday);
    if (r?.error) setErr(r.error);
    else flash(bday ? "Anniv enregistré" : "Anniv retiré");
  };

  const openPlace = (p: Place | null) => {
    setEditing(p ? p.id : "new");
    setDraft(p ? { name: p.name, address: p.address, doorCode: p.doorCode, access: p.access } : EMPTY_PLACE);
  };

  const savePlace = async () => {
    const id = editing === "new" ? null : editing;
    const r = await onSavePlace(id, draft);
    if (r?.error || !r.id) { setErr(r?.error || "Impossible d'enregistrer."); return; }
    const saved = { ...draft, name: draft.name.trim(), address: draft.address.trim(), doorCode: draft.doorCode.trim(), access: draft.access.trim() };
    setList((prev) => id
      ? prev.map((p) => (p.id === id ? { ...p, ...saved } : p))
      : [...prev, { ...saved, id: r.id!, ownerId: viewer.id, owner: viewer.pseudo, upcoming: 0 }]);
    setEditing(null);
    flash("Lieu enregistré");
  };

  const removePlace = async (p: Place) => {
    // Les events gardent le nom du lieu ; seules l'adresse et le code partent.
    const warn = p.upcoming > 0
      ? `${p.upcoming} event${p.upcoming > 1 ? "s" : ""} à venir s'y tien${p.upcoming > 1 ? "nent" : "t"} : ${p.upcoming > 1 ? "ils garderont" : "il gardera"} le nom, mais plus l'adresse ni le code. `
      : "";
    if (!window.confirm(`${warn}Supprimer « ${p.name} » ?`)) return;
    const r = await onDeletePlace(p.id);
    if (r?.error) { setErr(r.error); return; }
    setList((prev) => prev.filter((x) => x.id !== p.id));
    flash("Lieu supprimé");
  };

  const makeInvite = async () => {
    const r = await onInvite();
    if (r?.url) setInvite(r.url);
    else setErr(r?.error || "Impossible de créer le lien.");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      flash("Lien copié");
    } catch {
      // Le presse-papier est refusé hors HTTPS : on montre le lien à copier.
      setErr(invite);
    }
  };

  return (
    <div className="rg">
      <header className="rg-head">
        {/* Une flèche seule : le mot « Retour » ne disait rien que la flèche
            ne dise déjà, et volait la place du titre. */}
        <Link className="rg-back" href="/" aria-label="Revenir au hub">
          <ChevronLeft size={19} strokeWidth={2.4} />
        </Link>
        <h1>Réglages</h1>
      </header>

      {saved && <p className="rg-flash">{saved}</p>}
      {err && <p className="rg-err">{err}</p>}

      <section className="rg-sec">
        <h2><Bell size={16} /> Notifications</h2>

        {push.state === "unsupported" ? (
          <p className="rg-hint">
            Ajoute d&apos;abord l&apos;app à ton écran d&apos;accueil : sur iPhone, les
            notifications n&apos;existent que là.
          </p>
        ) : push.state === "denied" ? (
          <p className="rg-hint">
            Tu les as refusées. Ça se rouvre dans les réglages de ton téléphone, à la ligne de
            cette app.
          </p>
        ) : (
          <>
            <button className="rg-btn" disabled={push.busy || push.state === "checking"}
              onClick={push.state === "on" ? push.disable : push.enable}>
              {push.busy ? "Un instant…"
                : push.state === "on" ? "Couper les notifications"
                : "Activer les notifications"}
            </button>
            {push.err && <p className="rg-err">{push.err}</p>}
          </>
        )}

        {push.state === "on" && (
          <>
            <h3><MapPin size={14} /> Mes villes</h3>
            <p className="rg-hint">Tu seras prévenu des plans du quotidien dans ces villes.</p>
            <div className="rg-chips">
              {Object.keys(CITIES).map((c) => (
                <button key={c} type="button" aria-pressed={picked.includes(c)}
                  className={"rg-chip" + (picked.includes(c) ? " on" : "")}
                  onClick={() => toggleCity(c)}>
                  {CITIES[c]} {c}
                </button>
              ))}
            </div>

            <h3>Ce qui me fait vibrer</h3>
            <div className="rg-list">
              {PREFS.map(([k, label, hint]: string[]) => (
                <button key={k} type="button" role="switch" aria-checked={Boolean(flags[k])}
                  className={"rg-row" + (flags[k] ? " on" : "")} onClick={() => flip(k)}>
                  <span className="rg-box">{flags[k] && <Check size={12} strokeWidth={3} />}</span>
                  <span>
                    <b>{label}</b>
                    <em>{hint}</em>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="rg-sec">
        <h2><UserPen size={16} /> Mon compte</h2>
        <label className="rg-field">
          <span>Ton blaze</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <button className="rg-btn" onClick={saveName} disabled={!name.trim() || name === viewer.pseudo}>
          Enregistrer
        </button>
        <label className="rg-field">
          <span><Cake size={13} /> Ton anniv</span>
          <input type="date" value={bday} onChange={(e) => setBday(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
        </label>
        <button className="rg-btn" onClick={saveBirthday} disabled={bday === birthday}>
          Enregistrer
        </button>
        <p className="rg-hint">Le groupe sera prévenu le matin du jour J. Facultatif.</p>
        <p className="rg-hint">
          Connecté avec {viewer.email}. Pour changer ton mot de passe, déconnecte-toi et utilise
          « Mot de passe oublié ».
        </p>
      </section>

      <section className="rg-sec">
        <h2><House size={16} /> Nos lieux</h2>
        <p className="rg-hint">Chez les uns et les autres : choisis-les dans « Où ? » en créant un event, la fiche affichera adresse et code.</p>
        <div className="rg-places">
          {list.map((p) => editing === p.id ? (
            <PlaceForm key={p.id} draft={draft} setDraft={setDraft} onSave={savePlace} onCancel={() => setEditing(null)} />
          ) : (
            <div className="rg-place" key={p.id}>
              <div className="rg-place-head">
                <b>{p.name}</b>
                <em>{p.ownerId === viewer.id ? "à toi" : p.owner}</em>
              </div>
              {p.address && (
                <a className="rg-place-line" href={mapsUrl(p.address)} target="_blank" rel="noopener noreferrer">
                  <MapPin size={13} /> {p.address}
                </a>
              )}
              {p.doorCode && <span className="rg-place-line"><KeyRound size={13} /> Code : <b>{p.doorCode}</b></span>}
              {p.access && <span className="rg-place-line"><Building size={13} /> {p.access}</span>}
              {p.ownerId === viewer.id && (
                <div className="rg-place-acts">
                  <button onClick={() => openPlace(p)}><Pencil size={13} /> Modifier</button>
                  <button className="danger" onClick={() => removePlace(p)}><Trash2 size={13} /> Supprimer</button>
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && editing !== "new" && <p className="rg-hint">Aucun lieu pour l&apos;instant.</p>}
          {editing === "new" && <PlaceForm draft={draft} setDraft={setDraft} onSave={savePlace} onCancel={() => setEditing(null)} />}
        </div>
        {editing === null && (
          <button className="rg-btn" onClick={() => openPlace(null)}><Plus size={14} /> Ajouter un lieu</button>
        )}
      </section>

      <section className="rg-sec">
        <h2><Users size={16} /> Le groupe · {members.length}</h2>
        <div className="rg-people">
          {members.map((m) => (
            <span className="rg-person" key={m.id}>
              {m.pseudo}
              {m.city && <em> · {m.city}</em>}
            </span>
          ))}
        </div>

        <h3><Link2 size={14} /> Inviter un ami</h3>
        {invite ? (
          <>
            <p className="rg-hint">Valable 7 jours. Qui l&apos;ouvre rejoint le hub.</p>
            <button className="rg-btn" onClick={copy}>Copier le lien</button>
          </>
        ) : (
          <button className="rg-btn" onClick={makeInvite}>Créer un lien d&apos;invitation</button>
        )}
      </section>
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
    <div className="rg-place editing">
      <label className="rg-field"><span>Nom</span>
        <input value={draft.name} onChange={set("name")} placeholder="Ex. Chez moi, Maison d'Arcachon" maxLength={60} autoFocus />
      </label>
      <label className="rg-field"><span>Adresse</span>
        <input value={draft.address} onChange={set("address")} placeholder="12 rue des Lilas, 33000 Bordeaux" />
      </label>
      <div className="rg-row2">
        <label className="rg-field"><span>Code d&apos;entrée</span>
          <input value={draft.doorCode} onChange={set("doorCode")} placeholder="A1234" />
        </label>
        <label className="rg-field"><span>Étage / interphone</span>
          <input value={draft.access} onChange={set("access")} placeholder="3e, « Dupont »" />
        </label>
      </div>
      <div className="rg-place-acts">
        <button onClick={onCancel}>Annuler</button>
        <button className="primary" onClick={onSave} disabled={!draft.name.trim()}>Enregistrer</button>
      </div>
    </div>
  );
}

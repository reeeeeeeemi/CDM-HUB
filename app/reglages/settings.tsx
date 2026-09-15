"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Check, Bell, Users, UserPen, Link2, MapPin } from "lucide-react";

import { CITIES } from "@/lib/brand";
import { usePush, PREFS } from "@/lib/use-push";

type Member = { id: string; pseudo: string; city: string };
type Prefs = Record<string, boolean>;

type Props = {
  viewer: { id: string; email: string; pseudo: string };
  members: Member[];
  cities: string[];
  prefs: Prefs;
  onSetCities: (cities: string[]) => Promise<{ error?: string }>;
  onSetPrefs: (prefs: Prefs) => Promise<{ error?: string }>;
  onSetPseudo: (pseudo: string) => Promise<{ error?: string }>;
  onInvite: () => Promise<{ url?: string; error?: string }>;
};

export default function Settings({
  viewer, members, cities, prefs, onSetCities, onSetPrefs, onSetPseudo, onInvite,
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
        <p className="rg-hint">
          Connecté avec {viewer.email}. Pour changer ton mot de passe, déconnecte-toi et utilise
          « Mot de passe oublié ».
        </p>
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

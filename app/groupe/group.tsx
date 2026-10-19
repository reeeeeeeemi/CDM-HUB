"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Users, MapPin, Shapes, Link2, Crown, LogOut, Trash2, Pencil } from "lucide-react";

import { CATEGORIES, MAX_CATEGORIES, MIN_CATEGORIES } from "@/lib/catalog";
import { groupBadge, type City, type Group } from "@/lib/group";
import type { GroupEdit } from "@/lib/actions/group";

import CitySearch from "../groupes/city-search";
import CategoryPicker from "../groupes/category-picker";

type Member = { id: string; pseudo: string; admin: boolean };
type Result = Promise<{ error?: string } | undefined | void>;

type Props = {
  me: string;
  isAdmin: boolean;
  group: Group;
  members: Member[];
  onSave: (g: GroupEdit) => Promise<{ error?: string }>;
  onSetRole: (userId: string, role: "admin" | "member") => Promise<{ error?: string }>;
  onRemove: (userId: string) => Promise<{ error?: string }>;
  onLeave: () => Result;
  onDelete: () => Result;
  onInvite: () => Promise<{ url?: string; error?: string }>;
};

const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase();
};

/**
 * La page d'un groupe. Chaque bloc s'édite à part, avec son propre bouton :
 * changer une ville ne demande pas de relire les catégories. Un membre qui
 * n'est pas admin voit les mêmes blocs, sans les crayons.
 */
export default function GroupPage({ me, isAdmin, group, members, onSave, onSetRole, onRemove, onLeave, onDelete, onInvite }: Props) {
  const [g, setG] = useState({ name: group.name, emoji: group.emoji ?? "", tagline: group.tagline ?? "" });
  const [cities, setCities] = useState<City[]>(group.cities);
  const [cats, setCats] = useState<string[]>(group.categories.filter((k) => k !== "autre"));
  const [editing, setEditing] = useState<"" | "id" | "cities" | "cats">("");
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState("");
  const [invite, setInvite] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [danger, setDanger] = useState<"" | "leave" | "delete">("");
  const [pending, start] = useTransition();

  const flash = (msg: string) => { setSaved(msg); setTimeout(() => setSaved(""), 2000); };

  // Le groupe s'enregistre d'un bloc : la base attend une ligne complète et
  // valide. Annuler remet le bloc tel qu'il était.
  const save = (what: string) =>
    start(async () => {
      setErr("");
      const r = await onSave({ ...g, cities, categories: cats });
      if (r?.error) { setErr(r.error); return; }
      setEditing("");
      flash(`${what} enregistré${what.endsWith("s") ? "s" : ""}`);
    });

  const cancel = () => {
    setG({ name: group.name, emoji: group.emoji ?? "", tagline: group.tagline ?? "" });
    setCities(group.cities);
    setCats(group.categories.filter((k) => k !== "autre"));
    setEditing("");
    setErr("");
  };

  const act = (fn: () => Result, done?: string) =>
    start(async () => {
      setErr("");
      const r = await fn();
      if (r && "error" in r && r.error) setErr(r.error);
      else if (done) flash(done);
    });

  const makeInvite = () =>
    start(async () => {
      const r = await onInvite();
      if (r?.url) setInvite(r.url);
      else setErr(r?.error || "Impossible de créer le lien.");
    });

  const copy = async () => {
    try { await navigator.clipboard.writeText(invite); flash("Lien copié"); }
    catch { setErr(invite); }
  };

  const otherAdmins = members.filter((m) => m.admin && m.id !== me).length;
  const catsOk = cats.length >= MIN_CATEGORIES && cats.length <= MAX_CATEGORIES;
  const editBtn = (block: "id" | "cities" | "cats") =>
    isAdmin && editing !== block ? (
      <button className="gp-edit" onClick={() => { cancel(); setEditing(block); }} aria-label="Modifier"><Pencil size={14} /> Modifier</button>
    ) : null;
  const actions = (what: string, ok = true) => (
    <div className="gp-acts">
      <button className="rg-btn" onClick={cancel} disabled={pending}>Annuler</button>
      <button className="rg-btn primary" onClick={() => save(what)} disabled={pending || !ok}>{pending ? "…" : "Enregistrer"}</button>
    </div>
  );

  return (
    <div className="rg">
      <header className="rg-head">
        <Link className="rg-back" href="/" aria-label="Revenir au hub">
          <ChevronLeft size={19} strokeWidth={2.4} />
        </Link>
        <h1>Le groupe</h1>
      </header>

      {saved && <p className="rg-flash" role="status">{saved}</p>}
      {err && <p className="rg-err" role="alert">{err}</p>}

      {/* Identité */}
      <section className="rg-sec">
        <div className="rg-sec-head"><h2>{isAdmin ? "Identité" : group.name}</h2>{editBtn("id")}</div>
        {editing === "id" ? (
          <>
            <div className="ng-name">
              <label className="rg-field ng-emoji"><span>Emoji</span>
                <input value={g.emoji} onChange={(e) => setG({ ...g, emoji: e.target.value })} placeholder="🎉" maxLength={8} />
              </label>
              <label className="rg-field"><span>Nom</span>
                <input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} maxLength={40} />
              </label>
            </div>
            <label className="rg-field"><span>Phrase d&apos;accueil <em>· facultatif</em></span>
              <input value={g.tagline} onChange={(e) => setG({ ...g, tagline: e.target.value })} maxLength={280} />
            </label>
            {actions("Groupe", Boolean(g.name.trim()))}
          </>
        ) : (
          <div className="gp-id">
            <span className="gp-badge">{groupBadge({ name: g.name, emoji: g.emoji || null })}</span>
            <div><b>{g.name}</b>{g.tagline && <p>{g.tagline}</p>}</div>
          </div>
        )}
      </section>

      {/* Villes */}
      <section className="rg-sec">
        <div className="rg-sec-head"><h2><MapPin size={16} /> Villes</h2>{editBtn("cities")}</div>
        {editing === "cities" ? (
          <>
            <p className="rg-hint">Elles filtrent les plans du quotidien. Sans ville, tout s&apos;affiche ensemble.</p>
            <CitySearch cities={cities} onChange={setCities} />
            {actions("Villes")}
          </>
        ) : cities.length === 0 ? (
          <p className="rg-hint">Aucune ville : les plans s&apos;affichent tous ensemble.</p>
        ) : (
          <div className="rg-chips">{cities.map((c) => <span className="rg-chip" key={c.name}>{c.emoji} {c.name}</span>)}</div>
        )}
      </section>

      {/* Catégories */}
      <section className="rg-sec">
        <div className="rg-sec-head"><h2><Shapes size={16} /> Catégories</h2>{editBtn("cats")}</div>
        {editing === "cats" ? (
          <>
            <p className="rg-hint">Un event dont la catégorie est retirée garde son affichage.</p>
            <CategoryPicker picked={cats} onChange={setCats} />
            {actions("Catégories", catsOk)}
          </>
        ) : (
          <div className="rg-chips">
            {[...cats, "autre"].map((k) => {
              const c = CATEGORIES[k];
              return c ? <span key={k} className="ng-cat on" style={{ "--c": c.color } as React.CSSProperties}>{c.emoji} {c.label}</span> : null;
            })}
          </div>
        )}
      </section>

      {/* Membres */}
      <section className="rg-sec">
        <h2><Users size={16} /> Membres · {members.length}</h2>
        <div className="gp-members">
          {members.map((m) => (
            <div className="gp-member" key={m.id}>
              <span className="gp-av">{initials(m.pseudo)}</span>
              <span className="gp-name">
                {m.pseudo}{m.id === me && <em> (toi)</em>}
                {m.admin && <span className="gp-admin"><Crown size={11} /> Admin</span>}
              </span>
              {isAdmin && m.id !== me && (
                <span className="gp-macts">
                  <button disabled={pending} onClick={() => act(() => onSetRole(m.id, m.admin ? "member" : "admin"), m.admin ? `${m.pseudo} n'est plus admin` : `${m.pseudo} est admin`)}>
                    {m.admin ? "Retirer admin" : "Nommer admin"}
                  </button>
                  <button className="danger" disabled={pending}
                    onClick={() => window.confirm(`Retirer ${m.pseudo} du groupe ? Ses events et messages restent.`) && act(() => onRemove(m.id), `${m.pseudo} retiré du groupe`)}>
                    Retirer
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>

        <h3><Link2 size={14} /> Inviter quelqu&apos;un</h3>
        {invite ? (
          <>
            <p className="rg-hint">Valable 7 jours. Qui l&apos;ouvre rejoint {group.name}.</p>
            <button className="rg-btn" onClick={copy}>Copier le lien</button>
          </>
        ) : (
          <button className="rg-btn" onClick={makeInvite} disabled={pending}>Créer un lien d&apos;invitation</button>
        )}
      </section>

      {/* Partir, supprimer */}
      <section className="rg-sec gp-danger">
        {danger === "" && (
          <div className="gp-dacts">
            <button className="rg-btn" onClick={() => setDanger("leave")}><LogOut size={15} /> Quitter le groupe</button>
            {isAdmin && <button className="rg-btn danger" onClick={() => setDanger("delete")}><Trash2 size={15} /> Supprimer le groupe</button>}
          </div>
        )}
        {danger === "leave" && (
          <>
            <p className="rg-hint">
              {isAdmin && otherAdmins === 0 && members.length > 1
                ? "Tu es le seul admin : nomme quelqu'un d'autre avant de partir."
                : members.length === 1
                  ? `Tu es seul dans ${group.name} : le groupe sera supprimé avec toi.`
                  : `Tu ne verras plus les plans de ${group.name}. Tes events et messages restent, signés de ton pseudo.`}
            </p>
            <div className="gp-acts">
              <button className="rg-btn" onClick={() => setDanger("")}>Annuler</button>
              <button className="rg-btn danger" disabled={pending || (isAdmin && otherAdmins === 0 && members.length > 1)}
                onClick={() => act(onLeave)}>Quitter</button>
            </div>
          </>
        )}
        {danger === "delete" && (
          <>
            <p className="rg-hint">
              Tout part : events, réponses, messages, lieux du groupe, invitations. Les chez-soi restent à leurs
              propriétaires. <b>Sans retour possible.</b> Retape « {group.name} » pour confirmer.
            </p>
            <label className="rg-field"><input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={group.name} autoComplete="off" /></label>
            <div className="gp-acts">
              <button className="rg-btn" onClick={() => { setDanger(""); setConfirmName(""); }}>Annuler</button>
              <button className="rg-btn danger" disabled={pending || confirmName.trim() !== group.name.trim()} onClick={() => act(onDelete)}>
                Supprimer définitivement
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";

import { joinGroup } from "@/lib/actions/group";

type Props = {
  token: string;
  group: string;
  already: boolean;
  /** Celui du dernier groupe rejoint, à défaut celui de l'inscription. */
  pseudo: string;
  homes: { id: string; name: string }[];
};

/**
 * Entrer dans le groupe : son pseudo d'ici, et ce qu'il verra de chez soi.
 * Tout chez-soi est montré par défaut — c'est l'usage — mais se décoche.
 */
export default function JoinForm({ token, group, already, pseudo, homes }: Props) {
  const [name, setName] = useState(pseudo);
  const [hidden, setHidden] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const toggle = (id: string) =>
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  const submit = () =>
    start(async () => {
      setErr("");
      // En cas de succès, l'action redirige : on ne revient ici qu'en échec.
      const r = await joinGroup(token, name, hidden);
      if (r?.error) setErr(r.error);
    });

  if (already) {
    return (
      <button className="auth-submit" disabled={pending} onClick={submit}>
        {pending ? "Ouverture…" : `Ouvrir ${group}`}
      </button>
    );
  }

  return (
    <form className="auth-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="auth-field">
        <label htmlFor="pseudo">Ton blaze dans {group}</label>
        <input id="pseudo" value={name} onChange={(e) => setName(e.target.value)}
          maxLength={40} autoComplete="nickname" required />
      </div>

      {homes.length > 0 && (
        <fieldset className="auth-homes">
          <legend>Ce que {group} verra de chez toi</legend>
          {homes.map((h) => (
            <label key={h.id}>
              <input type="checkbox" checked={!hidden.includes(h.id)} onChange={() => toggle(h.id)} />
              <span>{h.name} <em>· adresse, code, wifi</em></span>
            </label>
          ))}
        </fieldset>
      )}

      {err && <p className="auth-msg err" role="alert">{err}</p>}
      <button className="auth-submit" type="submit" disabled={pending || name.trim().length < 2}>
        {pending ? "On t'ajoute…" : `Rejoindre ${group}`}
      </button>
    </form>
  );
}

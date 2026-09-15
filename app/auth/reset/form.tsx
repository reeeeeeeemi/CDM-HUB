"use client";

import { useActionState } from "react";
import { KeyRound, Send } from "lucide-react";

import { updatePassword, type AuthState } from "@/app/login/actions";
import { GROUP } from "@/lib/brand";
import "@/app/login/login.css";

const EMPTY: AuthState = {};

export function NewPasswordForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(updatePassword, EMPTY);

  return (
    <div className="auth">
      <div className="auth-badge">
        <KeyRound size={30} />
      </div>

      <p className="auth-kicker">{GROUP}</p>
      <h1 className="auth-title">Nouveau mot de passe</h1>
      <p className="auth-sub">
        Choisis-en un pour {email}. Tu seras connecté dans la foulée.
      </p>

      <form className="auth-form" action={action}>
        <div className="auth-field">
          <label htmlFor="password">Nouveau mot de passe</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            placeholder="6 caractères minimum"
            required
            autoFocus
          />
        </div>

        <div className="auth-field">
          <label htmlFor="confirm">Répète-le</label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>

        {state.error && (
          <p className="auth-msg err" role="alert">
            {state.error}
          </p>
        )}

        <button className="auth-submit" type="submit" disabled={pending}>
          {pending ? "Un instant…" : "Enregistrer"}
          {!pending && <Send size={16} />}
        </button>
      </form>

      <p className="auth-note">
        Note-le quelque part cette fois — le hub ne garde aucun moyen de te le rappeler.
      </p>
    </div>
  );
}

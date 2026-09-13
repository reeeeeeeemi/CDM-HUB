"use client";

import { useActionState, useEffect, useState } from "react";
import { KeyRound, PartyPopper, Send } from "lucide-react";

import { requestReset, signIn, signUp, type AuthState } from "./actions";
import "./login.css";

const EMPTY: AuthState = {};

type Mode = "in" | "up" | "forgot";

export function LoginForm({ next = "" }: { next?: string }) {
  const [mode, setMode] = useState<Mode>("in");

  // Safari restaure les pages depuis sa mémoire quand on appuie sur Retour,
  // sans rien redemander au serveur — la redirection des connectés ne s'y
  // applique donc pas. `persisted` signale exactement ce cas : on force alors
  // un vrai aller-retour, qui redirigera si la session est ouverte.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const [inState, inAction, inPending] = useActionState(signIn, EMPTY);
  const [upState, upAction, upPending] = useActionState(signUp, EMPTY);
  const [fgState, fgAction, fgPending] = useActionState(requestReset, EMPTY);

  const isSignUp = mode === "up";
  const isForgot = mode === "forgot";

  const state = isForgot ? fgState : isSignUp ? upState : inState;
  const pending = isForgot ? fgPending : isSignUp ? upPending : inPending;
  const action = isForgot ? fgAction : isSignUp ? upAction : inAction;

  return (
    <div className="auth">
      <div className="auth-badge">
        {isForgot ? <KeyRound size={30} /> : <PartyPopper size={30} />}
      </div>

      <p className="auth-kicker">CDM</p>

      {isForgot ? (
        <>
          <h1 className="auth-title">Mot de passe oublié</h1>
          <p className="auth-sub">
            Donne ton email, on t&apos;envoie un lien pour en choisir un nouveau.
          </p>
        </>
      ) : (
        <>
          <h1 className="auth-title">HUB Events CDM</h1>
          <p className="auth-sub">
            Pour retrouver tous les évènements organisés par le CDM, du voyage annuel au ski
            jusqu&apos;à la coinche du mardi où Kenny est encore le pire joueur autour de la table.
          </p>
        </>
      )}

      {!isForgot && (
        <div className="auth-seg" role="tablist" aria-label="Connexion ou inscription">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignUp}
            className={isSignUp ? "" : "on"}
            onClick={() => setMode("in")}
          >
            J&apos;ai déjà un compte
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignUp}
            className={isSignUp ? "on" : ""}
            onClick={() => setMode("up")}
          >
            Créer un compte
          </button>
        </div>
      )}

      {/* key={mode} : chaque mode repart avec un formulaire vierge. */}
      <form className="auth-form" action={action} key={mode}>
        {next && <input type="hidden" name="next" value={next} />}
        {isSignUp && (
          <div className="auth-field">
            <label htmlFor="pseudo">Ton blaze</label>
            <input
              id="pseudo"
              name="pseudo"
              type="text"
              autoComplete="nickname"
              placeholder="Ex. Antoine Dupont, Ankara Messi, La brosse"
              required
            />
            <p className="auth-hint">C&apos;est ce que les autres verront à côté de tes plans.</p>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="toi@exemple.com"
            required
          />
        </div>

        {!isForgot && (
          <div className="auth-field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={6}
              placeholder={isSignUp ? "6 caractères minimum" : ""}
              required
            />
          </div>
        )}

        {state.error && (
          <p className="auth-msg err" role="alert">
            {state.error}
          </p>
        )}
        {state.notice && (
          <p className="auth-msg ok" role="status">
            {state.notice}
          </p>
        )}

        <button className="auth-submit" type="submit" disabled={pending}>
          {pending
            ? "Un instant…"
            : isForgot
              ? "Envoyer le lien"
              : isSignUp
                ? "Créer mon compte"
                : "On y va"}
          {!pending && <Send size={16} />}
        </button>
      </form>

      <button
        type="button"
        className="auth-link"
        onClick={() => setMode(isForgot ? "in" : "forgot")}
      >
        {isForgot ? "← Revenir à la connexion" : "Mot de passe oublié ?"}
      </button>

      {!isForgot && (
        <p className="auth-note">
          Le hub est privé. Créer un compte ne suffit pas à voir les plans : il faut être ajouté au
          groupe. Demande à Rémi.
        </p>
      )}
    </div>
  );
}

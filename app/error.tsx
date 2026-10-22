"use client";

import { APP_NAME } from "@/lib/brand";
import "./login/login.css";

/**
 * Filet pour tout ce qui casse au rendu — en pratique, surtout Supabase
 * injoignable au moment d'ouvrir l'app. Mieux vaut un bouton « Réessayer »
 * qu'un écran de connexion pour quelqu'un dont la session est intacte.
 */
export default function Error({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="auth">
      <div className="auth-badge" aria-hidden="true">📡</div>
      <p className="auth-kicker">{APP_NAME}</p>
      <h1 className="auth-title">Pas de réseau ?</h1>
      <p className="auth-sub">Le serveur n&apos;a pas répondu. Tu es toujours connecté, rien n&apos;est perdu.</p>
      <button className="auth-submit" type="button" onClick={() => retry()} style={{ marginTop: 20 }}>
        Réessayer
      </button>
    </div>
  );
}

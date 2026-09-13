"use server";

// RedirectType.replace partout : dans une Server Action, redirect() empile
// par défaut, si bien que /login resterait dans l'historique et que le bouton
// Retour du navigateur y ramènerait après la connexion.
import { redirect, RedirectType } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; notice?: string };

/**
 * Où renvoyer après connexion. Seuls les chemins internes sont acceptés :
 * un "next" venu de l'extérieur ne doit pas pouvoir expédier l'utilisateur
 * ailleurs après qu'il a saisi son mot de passe.
 */
function safeNext(value: FormDataEntryValue | null) {
  const next = String(value ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** Traduit les messages de Supabase, qui sont en anglais et parfois obscurs. */
function readable(message: string) {
  if (message.includes("Invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (message.includes("Email not confirmed")) {
    return "Ton compte existe, mais l'email n'est pas encore confirmé. Regarde ta boîte mail.";
  }
  if (message.includes("already registered") || message.includes("already been registered")) {
    return "Un compte existe déjà avec cet email. Connecte-toi.";
  }
  if (message.includes("Password should be")) {
    return "Le mot de passe doit faire au moins 6 caractères.";
  }
  if (message.includes("rate limit") || message.includes("Too many")) {
    return "Trop de tentatives. Attends une minute et réessaie.";
  }
  return message;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Remplis les deux champs." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: readable(error.message) };

  redirect(safeNext(formData.get("next")), RedirectType.replace);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const pseudo = String(formData.get("pseudo") ?? "").trim();

  if (!email || !password || !pseudo) {
    return { error: "Remplis les trois champs." };
  }
  if (password.length < 6) {
    return { error: "Le mot de passe doit faire au moins 6 caractères." };
  }

  // L'email de confirmation doit revenir sur le bon domaine : localhost en
  // développement, l'URL Vercel en production.
  const origin = (await headers()).get("origin") ?? "";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/confirm`,
      // Repris par le trigger handle_new_user pour remplir profiles.pseudo.
      data: { pseudo },
    },
  });

  if (error) return { error: readable(error.message) };

  // Session absente = Supabase attend la confirmation par email.
  if (!data.session) {
    return { notice: `Compte créé. Ouvre le lien envoyé à ${email} pour le confirmer.` };
  }

  redirect(safeNext(formData.get("next")), RedirectType.replace);
}

export async function requestReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) return { error: "Indique ton email." };

  const origin = (await headers()).get("origin") ?? "";

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // La route /auth/confirm reconnaît le type "recovery" et bascule
    // vers l'écran de saisie du nouveau mot de passe.
    redirectTo: `${origin}/auth/confirm`,
  });

  if (error) return { error: readable(error.message) };

  // Message volontairement identique que le compte existe ou non : sinon la
  // page devient un moyen de savoir qui est inscrit.
  return {
    notice: `Si un compte utilise ${email}, un lien de réinitialisation vient d'y être envoyé.`,
  };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) {
    return { error: "Le mot de passe doit faire au moins 6 caractères." };
  }
  if (password !== confirm) {
    return { error: "Les deux mots de passe ne sont pas identiques." };
  }

  const supabase = await createClient();

  // Le lien de récupération a ouvert une session ; sans elle, rien à modifier.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Ton lien a expiré. Redemande-en un depuis l'écran de connexion." };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: readable(error.message) };

  redirect("/", RedirectType.replace);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login", RedirectType.replace);
}

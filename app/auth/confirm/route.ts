import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Cible du lien envoyé par email à l'inscription.
 *
 * Supabase y ajoute un token_hash à usage unique ; on l'échange contre une
 * vraie session, écrite dans les cookies par le client serveur.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (!tokenHash || !type) {
    redirect("/login?erreur=lien-incomplet");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Le lien a déjà servi, ou il a expiré.
    redirect("/login?erreur=lien-invalide");
  }

  // Un lien de récupération ouvre une session, mais l'utilisateur n'a toujours
  // pas de mot de passe qu'il connaît : on l'envoie le choisir.
  if (type === "recovery") {
    redirect("/auth/reset");
  }

  redirect("/");
}

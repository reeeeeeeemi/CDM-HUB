"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

const DAYS = 7;

/**
 * Crée un lien d'invitation valable une semaine.
 *
 * La politique RLS « un membre invite » fait le contrôle : un compte hors
 * du groupe ne peut pas en produire.
 */
export async function createInvite(): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Session expirée." };

  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("invites")
    .insert({ created_by: user.id, expires_at: expires })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // L'origine est prise de la requête : le lien pointe sur le domaine par
  // lequel on est arrivé, localhost en développement comme en production.
  const h = await headers();
  const origin = h.get("origin") || `https://${h.get("host")}`;

  return { url: `${origin}/invite/${data.id}` };
}

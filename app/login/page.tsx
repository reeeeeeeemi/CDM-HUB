import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { LoginForm } from "./form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const supabase = await createClient();

  // Sans ça, le bouton retour du navigateur ramène un utilisateur déjà
  // connecté sur l'écran de connexion, qui n'a plus rien à lui demander.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  const { next } = await searchParams;
  return <LoginForm next={typeof next === "string" ? next : ""} />;
}

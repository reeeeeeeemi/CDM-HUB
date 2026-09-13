import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { NewPasswordForm } from "./form";

export default async function ResetPage() {
  const supabase = await createClient();

  // On n'arrive ici qu'avec la session ouverte par le lien de récupération.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?erreur=lien-invalide");
  }

  return <NewPasswordForm email={user.email ?? ""} />;
}

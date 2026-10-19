import { redirect } from "next/navigation";

import { createGroup } from "@/lib/actions/group";

import { readViewer } from "../../hub";
import NewGroupForm from "./form";
import "../../reglages/reglages.css";
import "./groupes.css";

/**
 * Créer un groupe. Ouvert à tout compte connecté, qu'il ait déjà des
 * groupes ou non : c'est aussi la porte d'entrée de qui arrive sans
 * invitation.
 */
export default async function Page() {
  const viewer = await readViewer();
  if (!viewer) redirect("/login?next=/groupes/nouveau");

  return <NewGroupForm pseudo={viewer.pseudo} canGoBack={viewer.isMember} onCreate={createGroup} />;
}

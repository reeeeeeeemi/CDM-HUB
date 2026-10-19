import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createInvite } from "@/lib/actions/invite";
import { deleteGroup, leaveGroup, removeMember, setMemberRole, updateGroup } from "@/lib/actions/group";

import { NotYet, readViewer } from "../hub";
import GroupPage from "./group";
import "../login/login.css";
import "../reglages/reglages.css";
import "../groupes/groupes.css";
import "./groupe.css";

/**
 * Le groupe ouvert : qui il est, ses villes, ses catégories, ses membres.
 * L'admin y modifie tout ; les autres le lisent, et peuvent en partir.
 */
export default async function Page() {
  const viewer = await readViewer();

  if (!viewer) redirect("/login");
  if (!viewer.isMember || !viewer.group) return <NotYet viewer={viewer} />;

  const group = viewer.group;
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("members")
    .select("user_id, pseudo, role, added_at")
    .eq("group_id", group.id)
    .order("added_at");

  const members = ((rows ?? []) as { user_id: string; pseudo: string; role: "admin" | "member" }[]).map((r) => ({
    id: r.user_id,
    pseudo: r.pseudo,
    admin: r.role === "admin",
  }));

  return (
    <GroupPage
      me={viewer.id}
      isAdmin={viewer.role === "admin"}
      group={group}
      members={members}
      onSave={updateGroup.bind(null, group.id)}
      onSetRole={setMemberRole.bind(null, group.id)}
      onRemove={removeMember.bind(null, group.id)}
      onLeave={leaveGroup.bind(null, group.id)}
      onDelete={deleteGroup.bind(null, group.id)}
      onInvite={createInvite.bind(null, group.id)}
    />
  );
}

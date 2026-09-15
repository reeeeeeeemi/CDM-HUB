import { redirect } from "next/navigation";

import { Hub, NotYet, readViewer } from "./hub";
import "./login/login.css";

export default async function Page() {
  const viewer = await readViewer();

  if (!viewer) redirect("/login");
  if (!viewer.isMember) return <NotYet viewer={viewer} />;

  return <Hub viewer={viewer} />;
}

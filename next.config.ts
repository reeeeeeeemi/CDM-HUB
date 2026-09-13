import os from "node:os";
import type { NextConfig } from "next";

/**
 * Adresses IPv4 de cette machine sur le réseau local.
 *
 * Sans elles, ouvrir l'app depuis un téléphone via http://192.168.x.x:3000
 * affiche la page mais rien ne réagit : Next bloque ses ressources de dev
 * pour toute origine autre que localhost, donc le JavaScript ne charge pas.
 */
function lanHosts() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === "IPv4" && !i.internal)
    .map((i) => i!.address);
}

const hosts = lanHosts();
const ports = ["3000", "3001"];

const nextConfig: NextConfig = {
  // Laisse le téléphone charger /_next/* et le rechargement à chaud.
  allowedDevOrigins: hosts,

  experimental: {
    serverActions: {
      // Et laisse passer connexion, inscription et déconnexion, qui sont
      // des Server Actions et vérifient l'origine séparément.
      allowedOrigins: hosts.flatMap((h) => ports.map((p) => `${h}:${p}`)),
    },
  },
};

export default nextConfig;

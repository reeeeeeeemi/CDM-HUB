import type { MetadataRoute } from "next";

/**
 * Permet « Ajouter à l'écran d'accueil » : l'app se lance alors en plein
 * écran, sans barre d'URL, comme une application installée.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HUB Events CDM",
    short_name: "HUB CDM",
    description:
      "Le QG des plans de la bande : ce qui arrive, ce qu'on propose, qui est chaud.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "fr",
    background_color: "#F4F2ED",
    theme_color: "#B4451F",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // Android recadre les icônes dans sa propre forme ; celle-ci le supporte.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

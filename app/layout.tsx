import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HUB Events CDM",
  description:
    "Tous les évènements du CDM, du voyage annuel au ski jusqu'à la coinche du mardi.",
  appleWebApp: {
    capable: true,
    title: "HUB CDM",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Indispensable pour que env(safe-area-inset-*) ait une valeur : sans ça,
  // iOS laisse des bandes blanches au lieu d'étendre la page sous l'encoche.
  viewportFit: "cover",
  themeColor: "#B4451F",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${inter.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}

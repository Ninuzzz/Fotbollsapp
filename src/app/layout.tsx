import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Nav, Footer } from "@/components/nav";
import { MotionProvider, ScrollProgress } from "@/components/motion";
import { getCurrentUser } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo";
import { inboxFor } from "@/lib/notify";
import { getActiveSeason } from "@/lib/season";
import { ServiceWorkerRegister } from "@/components/sw-register";

const bebas = Bebas_Neue({ weight: "400", subsets: ["latin", "latin-ext"], variable: "--font-bebas", display: "swap" });
const source = Source_Sans_3({ subsets: ["latin", "latin-ext"], variable: "--font-source", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Allsvenskantipset", template: "%s · Allsvenskantipset" },
  description: "Tippa Allsvenskans sluttabell. Minst antal fel vinner muggen, vandringspriset och äran.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#050b08",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Oberoende frågor körs parallellt (och cachas per förfrågan, så sidan kan återanvända dem)
  const [user, season, demo] = await Promise.all([getCurrentUser(), getActiveSeason(), isDemoMode()]);
  const unread = user ? (await inboxFor(user.id, season?.id)).filter((n) => !n.read).length : 0;
  // Personalisering: favoritlagets färger styr accentfärgen
  const teamStyle = user?.favoriteTeam
    ? ({ "--team": user.favoriteTeam.primaryColor, "--team-2": user.favoriteTeam.secondaryColor } as React.CSSProperties)
    : undefined;

  return (
    <html lang="sv" className={`${bebas.variable} ${source.variable}`}>
      <body className="pitch-bg min-h-dvh antialiased" style={teamStyle}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-gold focus:px-4 focus:py-2 focus:text-black">
          Hoppa till innehållet
        </a>
        <MotionProvider>
          <ScrollProgress />
          <Nav user={user ? { name: user.name, avatar: user.avatar, role: user.role } : null} unread={unread} />
          <main id="main" className="pb-safe">
            {children}
          </main>
          <Footer admin={user?.role === "ADMIN"} demo={demo} />
        </MotionProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

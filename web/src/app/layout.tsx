import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Backdrop } from "@/components/Backdrop";
import { Interactions } from "@/components/Interactions";
import { MotionPrefs } from "@/components/MotionPrefs";
import { PerfMode } from "@/components/PerfMode";
import { RouteTransition } from "@/components/RouteTransition";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";
import { fitCounts, fitCountsPhrase } from "@/lib/fitCounts";

// UI and headings use the system stack (real San Francisco on Apple devices; see --font-ui
// in globals.css). Inter (variable, self-hosted by next/font) is the named fallback so Windows,
// Linux and Android get the closest metric match. Geist Mono backs ui-monospace / SF Mono.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-mono-fallback", subsets: ["latin"], display: "swap" });

// Title, description and social cards share the visible headline: 23 years, 2003–2025 (E43).
const TITLE = "Emberline — 23 years of fire detections (2003–2025), harmonized across the sensor change";
const DESCRIPTION = `A harmonized MODIS + VIIRS record of satellite fire detections, 2003–2025: ${fitCountsPhrase()}, as a calendar for every fitted country or a drawn area.`;
export const metadata: Metadata = {
  title: { default: TITLE, template: "%s" },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Emberline", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};
export const viewport = { themeColor: "#f7f3e8" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body id="top" className="flex min-h-full flex-col">
        <MotionPrefs>
        <Backdrop />
        <PerfMode />
        <Interactions />
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">{children}</main>
        <SiteFooter counts={fitCounts()} />
        <RouteTransition />
        </MotionPrefs>
      </body>
    </html>
  );
}

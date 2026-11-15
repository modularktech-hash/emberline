import type { Metadata } from "next";
import localFont from "next/font/local";
import { Backdrop } from "@/components/Backdrop";
import { Interactions } from "@/components/Interactions";
import { MotionPrefs } from "@/components/MotionPrefs";
import { PerfMode } from "@/components/PerfMode";
import { REVEAL_SCRIPT } from "@/lib/reveal";
import { RouteTransition } from "@/components/RouteTransition";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { SearchPalette } from "@/components/Search";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import { DatasetBanner } from "@/components/DatasetBanner";
import "./globals.css";
import { fitCounts, fitCountsPhrase } from "@/lib/fitCounts";

// Four self-hosted faces: dot-matrix display, one grotesk for text, one mono for labels, one serif accent.
const dot = localFont({ src: "../fonts/doto.woff2", variable: "--f-dot", weight: "100 900", display: "swap" });
const ui = localFont({ src: "../fonts/space-grotesk.woff2", variable: "--f-ui", weight: "300 700", display: "swap" });
const mono = localFont({ src: [{ path: "../fonts/space-mono-400.woff2", weight: "400" }, { path: "../fonts/space-mono-700.woff2", weight: "700" }], variable: "--f-mono", display: "swap", preload: false });
const accent = localFont({ src: "../fonts/playfair-italic.woff2", variable: "--f-accent", weight: "500", style: "italic", display: "swap", preload: false });

// Title, description and social cards share the visible headline: 23 years, 2003–2025 (E43).
const TITLE = "Emberline — 23 years of fire detections (2003–2025), harmonized across the sensor change";
const DESCRIPTION = `A harmonized MODIS + VIIRS record of satellite fire detections, 2003–2025: ${fitCountsPhrase()}, as a calendar for every fitted country or a drawn area.`;
export const metadata: Metadata = {
  title: { default: TITLE, template: "%s" },
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, siteName: "Emberline", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};
export const viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f4f4f2" }, { media: "(prefers-color-scheme: dark)", color: "#0b0b0b" }] };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dot.variable} ${ui.variable} ${mono.variable} ${accent.variable} h-full antialiased`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body id="top" className="flex min-h-full flex-col">
        <MotionPrefs>
        <Backdrop />
        <PerfMode />
        <Interactions />
        <SiteNav />
        <DatasetBanner />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">{children}</main>
        <SiteFooter counts={fitCounts()} />
        <RouteTransition />
        <SearchPalette />
        <script dangerouslySetInnerHTML={{ __html: REVEAL_SCRIPT }} />
        <noscript><style>{"[data-reveal]{opacity:1;transform:none}"}</style></noscript>
        </MotionPrefs>
      </body>
    </html>
  );
}

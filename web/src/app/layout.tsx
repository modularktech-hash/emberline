import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { Backdrop } from "@/components/Backdrop";
import { Interactions } from "@/components/Interactions";
import { PerfMode } from "@/components/PerfMode";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

// UI and headings use the system stack (real San Francisco on Apple devices; see --font-ui
// in globals.css). Inter (variable, self-hosted by next/font) is the named fallback so Windows,
// Linux and Android get the closest metric match. Geist Mono backs ui-monospace / SF Mono.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-mono-fallback", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Emberline — 25 years of fire, one unbroken line", template: "%s" },
  description:
    "A harmonized MODIS + VIIRS record of satellite-detected burning activity, as a calendar for any area.",
};
export const viewport = { themeColor: "#f7f3e8" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body id="top" className="flex min-h-full flex-col">
        <Backdrop />
        <PerfMode />
        <Interactions />
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

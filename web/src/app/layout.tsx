import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Newsreader({ variable: "--font-display", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "Emberline — 25 years of fire, one unbroken line",
  description:
    "A harmonized MODIS + VIIRS record of satellite-detected burning activity, as a calendar for any area.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 sm:px-6">{children}</main>
        <footer className="border-t border-[var(--hairline)] px-4 py-8 text-xs leading-relaxed text-[var(--text-muted)] sm:px-6">
          <div className="mx-auto max-w-6xl">
            <p className="display mb-2 text-xl text-[var(--text-primary)]">Emberline</p>
            Active-fire data: NASA FIRMS — MODIS Collection 6.1 (Terra, Aqua) and VIIRS 375 m (Suomi-NPP).
            Built for the NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA.
          </div>
        </footer>
      </body>
    </html>
  );
}

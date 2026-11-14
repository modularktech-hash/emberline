import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AoiProvider } from "@/components/AoiProvider";
import { DemoBanner } from "@/components/DemoBanner";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Burning Activity Calendar",
  description:
    "One continuous 25-year record of active fire activity, harmonized across the MODIS and VIIRS sensor boundary.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AoiProvider>
          <DemoBanner />
          <SiteNav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
            {children}
          </main>
          <footer className="border-t border-[var(--hairline)] px-4 py-4 text-xs text-[var(--text-muted)] sm:px-6">
            Active fire data from NASA FIRMS (MODIS MCD14ML, VIIRS VNP14IMGML /
            VJ114IMGML). Land cover from MCD12Q1; burned area from MCD64A1.
          </footer>
        </AoiProvider>
      </body>
    </html>
  );
}

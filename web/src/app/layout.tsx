import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Newsreader({ variable: "--font-display", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "Emberline — 25 years of fire, one unbroken line", template: "%s" },
  description:
    "A harmonized MODIS + VIIRS record of satellite-detected burning activity, as a calendar for any area.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}

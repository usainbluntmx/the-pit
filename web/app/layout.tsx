import type { Metadata } from "next";
import localFont from "next/font/local";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

/**
 * Two families, both self-hosted so Pages and Dokploy render identically and nothing
 * waits on a third-party font host. Archivo carries the UI and the headlines; IBM Plex
 * Mono is reserved for numbers, addresses and contract data — mono as a measuring
 * instrument, not as decoration.
 */
const sans = localFont({
  src: "./fonts/archivo-latin.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const mono = localFont({
  src: [
    { path: "./fonts/plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-mono-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://the-pit.zerotwolabs.xyz"),
  applicationName: "THE PIT",
  title: "THE PIT — trading arenas where the market bites back",
  description:
    "Competitive trading arenas on Solana built on MagicBlock: gasless 10ms orders, a book sealed in the enclave, and a VRF that force-closes one player at random.",
  openGraph: {
    title: "THE PIT — the market bites back",
    description:
      "Same bankroll, real prices, one pot. Trading competitions on Solana where the pit takes one player at random.",
    siteName: "THE PIT",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "THE PIT — the market bites back",
    description:
      "Eight seats, one pot, and a verifiable draw that pulls one player out at market. Trading arenas on Solana.",
  },
};

export const viewport = {
  themeColor: "#07080a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}

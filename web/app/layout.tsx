import type { Metadata } from "next";
import { LangProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE PIT — trading arenas where the market bites back",
  description:
    "Competitive trading arenas on Solana built on MagicBlock: gasless 10ms orders, a book sealed in the enclave, and a VRF that force-closes one player at random.",
  openGraph: {
    title: "THE PIT — the market bites back",
    description:
      "Same bankroll, real prices, one pot. Trading competitions on Solana where the pit takes one player at random.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}

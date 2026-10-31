import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";

import { ConvexClientProvider } from "@/components/convex-client-provider";
import "./globals.css";

/*
 * Typography per PRD D6c (revised 2026-10-16, Phase 3.5):
 *   JetBrains Mono -> everything.
 * The mono/Inter pairing DESIGN.md §3 described is superseded — see
 * docs/design/typography.md. The variable name `--font-jetbrains` is kept
 * so the CSS tokens (`--font-sans`, `--font-mono`, …) need only repoint,
 * not rename.
 *
 * Weights match what the design package actually uses for Mono: 500/700.
 * 400 is added because body copy now sets in Mono and needs a text weight.
 */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Locked In",
  description: "A calm pomodoro focus app — deep work sanctuary.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Mint dark is the default theme (Phase 3.5): the product has always
    // been dark, and the attribute is what resolves the HeroUI tokens below.
    // Switching palettes/modes at runtime is Phase 5 — this only grounds it.
    <html lang="en" data-theme="mint-dark" className={jetbrainsMono.variable}>
      <body className="min-h-screen bg-background text-on-surface antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}

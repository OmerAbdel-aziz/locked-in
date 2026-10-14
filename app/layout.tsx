import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { ConvexClientProvider } from "@/components/convex-client-provider";
import "./globals.css";

/*
 * Typography per DESIGN.md §3:
 *   Inter          -> UI (headline / body / label)
 *   JetBrains Mono -> timer digits and status chrome ("the interface's heartbeat")
 * Both are variable fonts, self-hosted by next/font (no runtime request to
 * fonts.googleapis.com, no layout shift).
 *
 * Weights match the ones the design package actually uses:
 * Inter 400/500/700/800, JetBrains Mono 500/700.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "Locked In",
  description: "A calm pomodoro focus app — deep work sanctuary.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-background text-on-surface antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}

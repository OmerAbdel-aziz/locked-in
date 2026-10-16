/*
 * The stats surface — Tasks 20–22, PRD §4.1 (new route `/stats`).
 *
 * Same shell as the focus screen (ADR-004): the header carries the shared
 * Focus/Stats/Settings pill (Phase 9), the main column holds the range
 * selector, charts, trends, time-of-day, breakdowns and history. No 1px
 * divider borders for sectioning anywhere — boundaries are tonal shifts,
 * per DESIGN.md.
 */

import { StatusFooter } from "@/components/chrome/status-footer";
import { NavPill } from "@/components/chrome/nav-pill";
import { StreakBadge } from "@/components/chrome/streak-badge";
import { StatsPanel } from "@/components/stats/stats-panel";

export default function StatsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 w-full items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold tracking-tighter text-on-surface">
            Locked In
          </div>
          {/* Phase 9: the shared pill also carries the Settings dialog,
              which previously mounted only on `/` — without it this item
              would be dead on arrival here. */}
          <NavPill />
        </div>

        <div className="flex items-center gap-2">
          <StreakBadge />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 px-8 pb-20 pt-12">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-on-surface">
            Stats
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Everything derived from your session log — nothing precomputed.
          </p>
        </div>
        <StatsPanel />
      </main>

      {/* Live footer chrome, shared with the focus screen. */}
      <StatusFooter />
    </div>
  );
}

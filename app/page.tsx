/*
 * The focus screen — Tasks 7, 10 + 12.
 *
 * The left column is the live Timer Engine (ring, readout, controls) bound to
 * the store, with the mode tabs above the ring switching the engine's phase. The right column
 * is now the live "Today's Focus" panel (Task 10): create, complete and
 * reorder against Convex. Layout follows the two-column composition in
 * `docs/design/code.html` — a 12-column grid split 7/5 (ADR-004) — so column
 * placement matches `screen.png`.
 *
 * Still scaffolding, replaced by its own task:
 *   - the footer chrome (Task 26)
 *
 * The Task 2 token-probe strip has been removed, as it was always meant to
 * be once real components landed. Note there is not a single border-* used
 * for sectioning: boundaries are tonal shifts, per DESIGN.md's no-line rule.
 */

import { ModeTabs } from "@/components/timer/mode-tabs";
import { TimerEngine } from "@/components/timer/timer-engine";
import { NavPill } from "@/components/chrome/nav-pill";
import { StreakBadge } from "@/components/chrome/streak-badge";
import { ProgressCard } from "@/components/tasks/progress-card";
import { SummaryBento } from "@/components/tasks/summary-bento";
import { TaskPanel } from "@/components/tasks/task-panel";
import { StatusFooter } from "@/components/chrome/status-footer";
import { AccountButton } from "@/components/auth/account-button";
import {
  FocusShroud,
  ShroudColumn,
  ShroudHidden,
  ShroudToggle,
} from "@/components/shroud/focus-shroud";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 w-full items-center justify-between px-8">
        <div className="flex items-center gap-4">
          <div className="text-xl font-bold tracking-tighter text-on-surface">
            Locked In
          </div>
          {/* Phase 9: Focus/Stats/Settings pill, left right after the
              wordmark — shared with /stats so the two headers cannot
              drift again (they already had). */}
          <NavPill />
        </div>

        {/* Task 15: derived from the session log, never stored (ADR-003).
            Task 23's account entry joins the cluster (never a prompt).
            Settings left this cluster — it lives in the pill now. The mode
            tabs left the header too: they are a mode switch for the engine,
            so they sit above the ring. */}
        <div className="flex items-center gap-2">
          <StreakBadge />
          <AccountButton />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-12 gap-12 px-8 pb-20 pt-24">
        {/* Left column — Timer Engine (live since Task 7) with the
            mode tabs above the ring (Phase 9) and the active-task card
            beneath its controls (Task 12).
            `min-w-0`: grid/flex items refuse to shrink below their content
            otherwise, and the ring column overflowed 390px viewports
            (audit 2026-10-16). Structural spans live in ShroudColumn so
            the shroud-up full-width centering can never fight the 7/5
            rest state over the cascade. */}
        <ShroudColumn className="enter">
          <ModeTabs />
          <TimerEngine />
          <ProgressCard />
          <ShroudToggle />
        </ShroudColumn>

        {/* Right column — the live task panel (Task 10) above the live
            summary bento (Task 12). Entrances stagger after the engine.
            Unmounted while the shroud is up (Phase 9): the veil is
            pointer-events-none, so a merely-dimmed column would stay
            clickable beneath it. */}
        <ShroudHidden>
          <div className="col-span-12 min-w-0 space-y-8 lg:col-span-5">
            <div className="enter enter-1">
              <TaskPanel />
            </div>
            {/* Summary bento — passive readouts, no gate, no celebration. */}
            <div className="enter enter-2">
              <SummaryBento />
            </div>
          </div>
        </ShroudHidden>
      </main>

      {/* Live footer chrome (PRD §4.1): real local time + connection. */}
      <StatusFooter />
      {/* Task 18: the veil renders last so it covers nav, columns and footer;
          the engine + card rise above it via their own z-50 (see above). */}
      <FocusShroud />
    </div>
  );
}

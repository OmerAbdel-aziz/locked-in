/*
 * The focus screen — Tasks 7, 10 + 12.
 *
 * The left column is the live Timer Engine (ring, readout, controls) bound to
 * the store, and the header tabs switch the engine's phase. The right column
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
import { StreakBadge } from "@/components/chrome/streak-badge";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { ProgressCard } from "@/components/tasks/progress-card";
import { SummaryBento } from "@/components/tasks/summary-bento";
import { TaskPanel } from "@/components/tasks/task-panel";
import { StatusFooter } from "@/components/chrome/status-footer";
import { AccountButton } from "@/components/auth/account-button";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 w-full items-center justify-between px-8">
        <div className="text-xl font-bold tracking-tighter text-on-surface">
          Locked In
        </div>

        <ModeTabs />

        {/* Task 15: derived from the session log, never stored (ADR-003).
            Task 16's dialog sits beside it — both are header chrome.
            The Focus/Stats nav (Task 20) rides in the same cluster.
            Task 23's account entry joins the cluster (never a prompt). */}
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1 rounded-full bg-surface-container-low/60 p-1 text-xs font-semibold">
            <span
              aria-current="page"
              className="rounded-full bg-surface-container-highest px-3 py-1 text-on-surface"
            >
              Focus
            </span>
            <a
              href="/stats"
              className="rounded-full px-3 py-1 text-on-surface-variant"
            >
              Stats
            </a>
          </nav>
          <StreakBadge />
          <SettingsDialog />
          <AccountButton />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-12 gap-12 px-8 pb-20 pt-24">
        {/* Left column — Timer Engine (live since Task 7) with the
            active-task card beneath its controls (Task 12).
            `min-w-0`: grid/flex items refuse to shrink below their content
            otherwise, and the ring column overflowed 390px viewports
            (audit 2026-10-16). */}
        <div className="enter col-span-12 flex min-w-0 flex-col items-center justify-center lg:col-span-7">
          <TimerEngine />
          <ProgressCard />
        </div>

        {/* Right column — the live task panel (Task 10) above the live
            summary bento (Task 12). Entrances stagger after the engine. */}
        <div className="col-span-12 min-w-0 space-y-8 lg:col-span-5">
          <div className="enter enter-1">
            <TaskPanel />
          </div>
          {/* Summary bento — passive readouts, no gate, no celebration. */}
          <div className="enter enter-2">
            <SummaryBento />
          </div>
        </div>
      </main>

      {/* Live footer chrome (PRD §4.1): real local time + connection. */}
      <StatusFooter />
    </div>
  );
}

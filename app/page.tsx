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
 * Still scaffolding, replaced by their own tasks:
 *   - the streak pill (Task 15, which derives it from the session log)
 *   - the footer chrome (Task 26)
 *
 * The Task 2 token-probe strip has been removed, as it was always meant to
 * be once real components landed. Note there is not a single border-* used
 * for sectioning: boundaries are tonal shifts, per DESIGN.md's no-line rule.
 */

import { ModeTabs } from "@/components/timer/mode-tabs";
import { TimerEngine } from "@/components/timer/timer-engine";
import { ProgressCard } from "@/components/tasks/progress-card";
import { SummaryBento } from "@/components/tasks/summary-bento";
import { TaskPanel } from "@/components/tasks/task-panel";

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 w-full items-center justify-between px-8">
        <div className="text-xl font-bold tracking-tighter text-on-surface">
          Locked In
        </div>

        <ModeTabs />

        {/* Placeholder — Task 15 derives the real streak from the log. */}
        <div className="flex items-center gap-3 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          Streak: 5
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-12 gap-12 px-8 pb-20 pt-24">
        {/* Left column — Timer Engine (live since Task 7) with the
            active-task card beneath its controls (Task 12). */}
        <div className="col-span-12 flex flex-col items-center justify-center lg:col-span-7">
          <TimerEngine />
          <ProgressCard />
        </div>

        {/* Right column — the live task panel (Task 10) above the live
            summary bento (Task 12). */}
        <div className="col-span-12 space-y-8 lg:col-span-5">
          <TaskPanel />
          {/* Summary bento — passive readouts, no gate, no celebration. */}
          <SummaryBento />
        </div>
      </main>

      <footer className="flex items-center justify-between px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        <span>Locked In Status: Ready</span>
        <span className="font-mono">Local Time: 14:00</span>
      </footer>
    </div>
  );
}

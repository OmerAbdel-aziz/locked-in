/*
 * The focus screen — Task 7.
 *
 * The left column is now the live Timer Engine (ring, readout, controls)
 * bound to the store, and the header tabs switch the engine's phase. Layout
 * follows the two-column composition in `docs/design/code.html` — a 12-column
 * grid split 7/5 (ADR-004) — so column placement matches `screen.png`.
 *
 * Still scaffolding, replaced by their own tasks:
 *   - the right column's demo tasks (Task 10) and summary bento (Task 12)
 *   - the active-task card, which sits under the controls (Task 12; it needs
 *     a bound active task, which is Task 11)
 *   - the streak pill (Task 15, which derives it from the session log)
 *   - the footer chrome (Task 26)
 *
 * The Task 2 token-probe strip has been removed, as it was always meant to
 * be once real components landed. Note there is not a single border-* used
 * for sectioning: boundaries are tonal shifts, per DESIGN.md's no-line rule.
 */

import { ModeTabs } from "@/components/timer/mode-tabs";
import { TimerEngine } from "@/components/timer/timer-engine";

const DEMO_TASKS = [
  { title: "Finalize Q2 pitch deck", leaves: "4/8", done: false, active: true },
  { title: "Morning inbox zero", leaves: "1/1", done: true, active: false },
  { title: "Review architectural diagrams", leaves: "0/2", done: false, active: false },
] as const;

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
        {/* Left column — Timer Engine (live since Task 7). */}
        <div className="col-span-12 flex items-center justify-center lg:col-span-7">
          <TimerEngine />
        </div>

        {/* Right column — Editorial Bento (demo data until Tasks 10 + 12). */}
        <div className="col-span-12 space-y-8 lg:col-span-5">
          <section>
            <div className="mb-6 flex items-end justify-between">
              <h2 className="text-2xl font-bold tracking-tight text-on-surface">
                Today&apos;s Focus
              </h2>
              <span className="font-mono text-xs text-on-surface-variant">
                3 / 8 COMPLETED
              </span>
            </div>

            <div className="space-y-3">
              {DEMO_TASKS.map((task) => (
                <div
                  key={task.title}
                  className={`rounded-xl p-4 transition-colors ${
                    task.active
                      ? "border-l-2 border-primary bg-surface-container-low/50"
                      : "bg-surface-container-low/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        task.done
                          ? "text-on-surface-variant line-through"
                          : "text-on-surface"
                      }`}
                    >
                      {task.title}
                    </span>
                    <span className="font-mono text-[10px] text-on-surface-variant">
                      {task.leaves}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Summary bento — passive readouts, no gate, no celebration. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-surface-container-low p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Today&apos;s Output
              </p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-on-surface">
                2.0
                <span className="ml-1 text-base text-on-surface-variant">hrs</span>
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Focus Score
              </p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-primary">
                50%
              </p>
            </div>
          </div>
        </div>
      </main>

      <footer className="flex items-center justify-between px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        <span>Locked In Status: Ready</span>
        <span className="font-mono">Local Time: 14:00</span>
      </footer>
    </div>
  );
}

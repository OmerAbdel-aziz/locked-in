/*
 * Task 2 shell — a token smoke screen, not the product UI.
 *
 * This exists to prove the design tokens resolve as real Tailwind utilities
 * (Task 2 acceptance) and that no pure white leaks in. The actual timer,
 * task list and bento land in Tasks 7, 10 and 12 — this deliberately stops
 * at a static skeleton in the canonical two-column composition (ADR-004).
 *
 * Every class here is drawn from the design package. Note there is not a
 * single border-* used for sectioning: boundaries are tonal shifts, per
 * DESIGN.md's no-line rule.
 */

const TOKEN_PROBES = [
  { utility: "bg-surface-container-low", value: "#1c1b1b" },
  { utility: "text-primary", value: "#4be277" },
  { utility: "text-on-surface", value: "#e5e2e1" },
  { utility: "text-on-surface-variant", value: "#bccbb9" },
  { utility: "bg-surface-container-lowest", value: "#0e0e0e" },
  { utility: "bg-surface-container-highest", value: "#353534" },
  { utility: "text-tertiary", value: "#ffb5ab" },
] as const;

export default function Page() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* TopNavBar */}
      <header className="flex h-16 w-full items-center justify-between px-8">
        <div className="text-xl font-bold tracking-tighter text-on-surface">
          Locked In
        </div>
        <nav className="flex h-full items-center gap-8">
          <span className="flex h-full items-center border-b-2 border-primary pb-1 font-bold text-primary">
            Focus
          </span>
          <span className="font-medium text-on-surface/60">Short Break</span>
          <span className="font-medium text-on-surface/60">Long Break</span>
        </nav>
        <div className="flex items-center gap-3 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          Streak: 5
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 gap-16 px-8 py-16 lg:grid-cols-2">
        {/* Left column — Timer Engine */}
        <section className="flex flex-col items-center gap-8">
          <div className="relative flex h-64 w-64 items-center justify-center">
            <div className="absolute inset-0 rounded-full border-[6px] border-surface-container-highest opacity-20" />
            <div className="flex flex-col items-center">
              {/* Timer digits are the one place monospace is required. */}
              <span className="font-mono text-6xl font-bold tracking-tight text-on-surface">
                25:00
              </span>
              <span className="mt-4 rounded-full bg-surface-container-highest px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                Session 1 of 4
              </span>
            </div>
          </div>

          {/* Primary CTA uses the signature 145deg gradient, never a flat fill. */}
          <button className="cta-gradient w-full max-w-sm rounded-xl py-4 font-semibold text-on-primary shadow-2xl shadow-primary/20 transition-transform ease-sanctuary hover:scale-[0.98]">
            Start Focus Session
          </button>

          {/* Active task card — glassmorphism + green left rule, no 1px box. */}
          <div className="glass-panel flex w-full flex-col gap-4 rounded-2xl border-l-4 border-primary p-6">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <h2 className="text-lg font-bold tracking-tight">
                Finalize Q2 pitch deck
              </h2>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-highest">
              <div className="h-full w-1/2 rounded-full bg-primary" />
            </div>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              <span>4 / 8 Pomodoros</span>
              <span>Progress</span>
            </div>
          </div>
        </section>

        {/* Right column — Editorial Bento */}
        <section className="flex flex-col gap-8">
          <div className="rounded-2xl bg-surface-container-low p-6">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="text-lg font-bold tracking-tight">Today&apos;s Focus</h2>
              <span className="font-mono text-xs text-on-surface-variant">
                3 / 8 COMPLETED
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {[
                { title: "Finalize Q2 pitch deck", leaves: "4/8", done: false, active: true },
                { title: "Morning inbox zero", leaves: "1/1", done: true, active: false },
                { title: "Review architectural diagrams", leaves: "0/2", done: false, active: false },
              ].map((task) => (
                <div
                  key={task.title}
                  className={`rounded-xl px-4 py-3 ${
                    task.active
                      ? "bg-surface-container-lowest border-l-2 border-primary"
                      : "bg-surface-container-lowest/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm ${
                        task.done
                          ? "text-on-surface-variant line-through"
                          : "text-on-surface"
                      }`}
                    >
                      {task.title}
                    </span>
                    <span className="font-mono text-xs text-on-surface-variant">
                      {task.leaves}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary bento — passive readouts, no gate, no celebration. */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-surface-container-low p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Today&apos;s Output
              </p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-on-surface">
                2.0<span className="ml-1 text-base text-on-surface-variant">hrs</span>
              </p>
            </div>
            <div className="rounded-2xl bg-surface-container-low p-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Focus Score
              </p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-primary">50%</p>
            </div>
          </div>

          {/* Token probe strip — Task 2 evidence, delete once Task 7 lands. */}
          <div className="rounded-2xl bg-surface-container-low p-6">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Token probes
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {TOKEN_PROBES.map((probe) => {
                const isBg = probe.utility.startsWith("bg-");
                return (
                  <li key={probe.utility} className="flex items-center gap-3">
                    {/* bg-* probes fill the swatch; text-* probes repaint the
                        label itself, so every utility is visible evidence. */}
                    <span
                      className={`h-5 w-5 shrink-0 rounded-md ${
                        isBg ? probe.utility : "bg-surface-container-highest"
                      }`}
                      aria-hidden
                    />
                    <code
                      className={`font-mono text-xs ${
                        isBg ? "text-on-surface-variant" : probe.utility
                      }`}
                    >
                      {probe.utility}
                    </code>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </main>

      <footer className="flex items-center justify-between px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        <span>Locked In Status: Ready</span>
        <span className="font-mono">Local Time: 14:00</span>
      </footer>
    </div>
  );
}

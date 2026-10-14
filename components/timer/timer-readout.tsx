/**
 * The ring's readout — Task 7.
 *
 * The "Session N of M" pill above the monospace digits, exactly as the
 * design composes them. Digits are the one place JetBrains Mono is required
 * (DESIGN.md §3: "the interface's heartbeat").
 */

export interface TimerReadoutProps {
  /** Milliseconds left in the current phase. */
  remaining: number;
  /** 1-based focus session that will start next. */
  cyclePosition: number;
  sessionCount: number;
}

/**
 * Milliseconds → `mm:ss`, rounded *up* so a freshly started 25-minute phase
 * reads 25:00 rather than 24:59 for its first second.
 */
export function formatRemaining(remaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function TimerReadout({
  remaining,
  cyclePosition,
  sessionCount,
}: TimerReadoutProps) {
  return (
    <div className="z-10 flex flex-col items-center">
      <span className="mb-4 inline-block rounded-full bg-surface-container-low px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Session {cyclePosition} of {sessionCount}
      </span>

      <h1 className="font-mono text-7xl font-bold leading-none tracking-tighter text-on-surface md:text-[120px]">
        {formatRemaining(remaining)}
      </h1>
    </div>
  );
}

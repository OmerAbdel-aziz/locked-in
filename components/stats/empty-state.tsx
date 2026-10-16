/**
 * Calm empty state — Tasks 20/22, PRD §4.1 "Empty state for new users
 * (calm, no fabricated numbers)".
 *
 * One sentence about what will appear and one about how to get there. No
 * zeros dressed up as measurements, no illustration begging for attention.
 */

export function EmptyStateView() {
  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-8 text-center">
      <p className="text-lg font-semibold tracking-tight text-on-surface">
        No sessions yet
      </p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-on-surface-variant">
        Complete a focus session and it will appear here — per-day totals,
        trends, and history, all derived from your session log.
      </p>
    </div>
  );
}

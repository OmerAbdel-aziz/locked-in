"use client";

/**
 * Calm empty state (ADR-006) - Arc's EmptyState with the same words the
 * hand-rolled version kept: what will appear, and how to get there. No
 * zeros dressed up as measurements, no illustration begging for
 * attention - the icon is a quiet outline clock.
 */

import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Clock } from "lucide-react";

export function EmptyStateView() {
  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-6">
      <EmptyState
        title="No sessions yet"
        description="Complete a focus session and it will appear here - per-day totals, trends, and history, all derived from your session log."
        icon={<Clock width={24} height={24} strokeWidth={1.5} />}
        label="Empty stats"
      />
    </div>
  );
}

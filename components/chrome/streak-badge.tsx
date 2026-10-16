"use client";

/**
 * The header streak badge — Task 15 (PRD §4.1, ADR-003).
 *
 * A thin shell over the `sessions.streak` query, which derives the number
 * from the log on every read — this component stores nothing and computes
 * nothing. Same gating as the task panel: the query is skipped until the
 * anonymous identity exists, and the settling state keeps the pill's shape
 * so the header does not jump when the number lands.
 */

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { useTzOffsetMinutes } from "@/lib/use-tz-offset";

/** The fire mark: inline SVG, the size of the label it sits beside. */
export function StreakFlame() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 22c4.4 0 7.5-3 7.5-7.2 0-3.1-1.9-5.4-3.4-7C14.6 6.2 13.4 4.5 13.4 2c-3 2-4.7 4.2-5.6 6.6-.4-1-.5-2-.5-3.2C5.4 7 4.5 9.3 4.5 12 4.5 19 7.6 22 12 22Zm0-3.2c-2 0-3.4-1.5-3.4-3.6 0-1.4.7-2.4 1.4-3.3.6-.8 1.3-1.6 1.8-2.7.9 1 2.6 2.7 2.6 5 0 2.5-1.1 4.6-2.4 4.6Z" />
    </svg>
  );
}

export function StreakBadge() {
  const { isAuthenticated } = useConvexAuth();
  const tzOffsetMinutes = useTzOffsetMinutes();

  const streak = useQuery(
    api.sessions.streak,
    isAuthenticated ? { tzOffsetMinutes } : "skip",
  );

  return (
    <div
      aria-label={streak === undefined ? "Loading streak" : `Streak: ${streak}`}
      className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-bold text-primary"
    >
      <StreakFlame />
      {streak === undefined ? "Streak: –" : `Streak: ${streak}`}
    </div>
  );
}

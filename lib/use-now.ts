/**
 * The wall-clock "now" as external store state — Task 20 hotfix.
 *
 * Same construction as `useCountdown` (Task 7) and `useTzOffsetMinutes`
 * (Task 12): `useSyncExternalStore` with an inert subscribe and a constant
 * server snapshot, so Next 16's `blocking-prerender-current-time` guard
 * sees no clock call during render and the prerender stays static.
 *
 * The client snapshot is **quantised to the minute**. That is load-bearing,
 * not cosmetic: `useSyncExternalStore` compares snapshots with `Object.is`
 * on every render, and a raw `Date.now()` differs on every call — each
 * render produces a "new" snapshot, which schedules another render, which
 * reads a newer clock… React aborts that spiral as "Maximum update depth
 * exceeded" (seen live on `/stats`). Flooring to the minute keeps the
 * snapshot referentially stable across renders; a minute rollover commits
 * exactly one extra render, which also keeps day-scoped ranges fresh.
 */

import { useSyncExternalStore } from "react";

import { MS_PER_MINUTE } from "./aggregations";

export function useNow(): number {
  return useSyncExternalStore(
    () => () => {},
    () => Math.floor(Date.now() / MS_PER_MINUTE) * MS_PER_MINUTE,
    () => 0,
  );
}

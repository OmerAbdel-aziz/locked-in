/**
 * The device's UTC offset in minutes — Task 12.
 *
 * Same construction as `useCountdown`: a value the prerendered page cannot
 * honestly know, read through `useSyncExternalStore` so Next 16's
 * `blocking-prerender-current-time` guard sees no clock call during render.
 * (`new Date()` in a client component's render body is exactly what failed
 * the Task 7 build; the guard is about the *call*, not the value.) The
 * server snapshot is `0` — plain UTC — which is never used to issue a
 * query, because `useQuery` answers `undefined` during SSR regardless.
 *
 * The subscribe side is deliberately inert: the offset is a property of the
 * device's clock, not a stream of events. A DST change while the page sits
 * open is picked up on the next load — the same resolution every "today"
 * aggregate in this app has (PRD D5 pins "day" to the device's local
 * midnight and nothing finer).
 */

import { useSyncExternalStore } from "react";

export function useTzOffsetMinutes(): number {
  return useSyncExternalStore(
    () => () => {},
    () => -new Date().getTimezoneOffset(),
    () => 0,
  );
}

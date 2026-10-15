/**
 * Fractional ordering keys for the task list — Task 9.
 *
 * **The decision** (PRD §11.4 and `tasks/plan.md` both deferred it to this
 * task): *fractional index*, not integer ranks.
 *
 * With integer ranks, inserting one row between two others means renumbering
 * every row after it — a whole-list write for a single drag, and two drags
 * happening at once each renumber the list into a different shape, so the
 * loser's intent silently disappears. A fractional key inverts that: a drag
 * reads two neighbours and writes **one document**. Nothing after the
 * insertion point is touched, so two drags in different parts of the list
 * cannot fight over the rows between them.
 *
 * That is what "Reorder is O(1) neighbour insert and stable under concurrent
 * orders" in the task's acceptance criteria is asking for, and it is only
 * achievable with a key that can be split.
 *
 * ### Why numbers, when strings are the usual answer
 *
 * The standard fractional-index libraries use base-62 *strings*, which never
 * run out of room. `tasks.order` is already `v.number()` from schema v1, and
 * changing a field's type is a Convex schema change — which PRD §9 makes an
 * ask-first item. It was not asked for, so it was not done; the arithmetic
 * below works in the type the schema already declares.
 *
 * ### The one limit, stated plainly
 *
 * Halving a gap gives ~52 strictly-distinct keys before float64 runs out of
 * mantissa (two adjacent doubles no longer have a value between them). So a
 * single gap between two neighbouring tasks absorbs about fifty successive
 * inserts *into that same gap* before the guard below refuses.
 *
 * That is per gap, not per list: appends never halve a gap (they extend it),
 * and each insert splits one gap into two, so interleaving a hundred tasks
 * into a list costs no more headroom than fifty into one gap. A personal
 * pomodoro list cannot plausibly reach it, and if it does the failure is a
 * thrown error with the offending keys — not two tasks quietly sharing a
 * position and rendering in a stale order forever.
 */

/**
 * Distance between two tasks placed by an append or a drop at an end of the
 * list. Deliberately large: it leaves the full ~52-bit mantissa between any
 * two appends, so end-of-list inserts never consume the headroom that
 * interleaving into a gap does.
 */
export const APPEND_STEP = 1024;

/**
 * The key that sorts after `preceding` and before `following`.
 *
 * Pass `null` for either end of the list. **The neighbour given at a named
 * end must be the current extreme of the list** — `preceding` must be the
 * last row when `following` is `null`, and vice versa — because that branch
 * simply extends past it, and extending past an interior row would drop the
 * new key inside the list instead of after it. `convex/tasks.ts` enforces
 * this by anchoring to the bucket rather than trusting the argument.
 *
 * Both `null` yields `0`, which is only meaningful when there is no list yet.
 *
 * @param preceding order of the task this one goes **after**, or null for the
 *                  very front of the list
 * @param following order of the task this one goes **before**, or null for
 *                  the very end of the list
 * @returns a key strictly between the two neighbours
 * @throws when the neighbours are not in ascending order — a caller that
 *         passes them backwards has a stale view of the list and writing the
 *         key it computed would scramble the display
 * @throws when the gap is exhausted (see the header)
 */
export function orderBetween(
  preceding: number | null,
  following: number | null,
): number {
  if (preceding !== null && following !== null) {
    if (!(preceding < following)) {
      throw new Error(
        `orderBetween: neighbours are not ascending (after=${preceding}, before=${following})`,
      );
    }

    const midpoint = preceding + (following - preceding) / 2;

    // Equal on both sides means the gap is gone: float64 cannot represent a
    // value in it. Failing loudly beats emitting a duplicate key, because a
    // duplicate leaves two tasks tied on `order` and the list's order then
    // rests on the `_creationTime` tie-break rather than on the user's
    // arrangement.
    if (!(midpoint > preceding && midpoint < following)) {
      throw new Error(
        `orderBetween: no representable key between ${preceding} and ` +
          `${following}. The gap between these two tasks is exhausted.`,
      );
    }

    return midpoint;
  }

  if (following !== null) {
    return following - APPEND_STEP;
  }
  if (preceding !== null) {
    return preceding + APPEND_STEP;
  }
  return 0;
}

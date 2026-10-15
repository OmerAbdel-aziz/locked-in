/**
 * Turning a drop into a neighbour pair — Task 10.
 *
 * Framework-free because this is where a drag becomes a mutation argument,
 * and `convex/tasks.ts`'s `reorder` is strict about that argument's shape.
 * Keeping the arithmetic out of the event handler is what makes it testable:
 * jsdom has no layout, so anything computed from element rectangles there is
 * fiction — the rectangles stay in the component, the decision comes here.
 *
 * Two rules the server depends on:
 *
 *   1. **The neighbours exclude the dragged row.** `reorder` refuses a task
 *      named as its own neighbour, and a pair that included it would measure
 *      the gap against the row's *old* position — which, for a row dropped
 *      where it already was, is no gap at all.
 *   2. **A drop that changes nothing produces no call.** Dropping a row onto
 *      itself, or onto a list that holds only it, names no gap between any
 *      two rows: it returns `null`s and the caller skips the round trip
 *      rather than asking the server to do nothing.
 *
 * The neighbours are also what makes Task 9's "unnamed end" rule fall out for
 * free: dropping below the last row passes `beforeId: null`, and the server
 * anchors that to the end of the bucket rather than trusting this to be right.
 */

/** Which half of the row the pointer was in when it was hovered. */
export type DropPosition = "above" | "below";

export interface DropNeighbours<Id> {
  /** The row the dragged one should now come after; `null` for the front. */
  afterId: Id | null;
  /** The row it should now come before; `null` for the back. */
  beforeId: Id | null;
}

/**
 * The gap a drop lands in, expressed as the pair `reorder` expects.
 *
 * @param orderedIds rows of the *draggable* group in display order — the
 *                   open tasks only, since Task 9 refuses to reorder across
 *                   the open/completed boundary
 * @param draggedId  the row being moved
 * @param targetId   the row it was dropped onto
 * @param position   whether it went down onto the target's top or bottom half
 */
export function dropNeighbours<Id extends string>(
  orderedIds: readonly Id[],
  draggedId: Id,
  targetId: Id,
  position: DropPosition,
): DropNeighbours<Id> {
  // Removing the dragged row first is rule 1: the gap is measured between
  // what remains, exactly as the server will read it.
  const remaining = orderedIds.filter((id) => id !== draggedId);
  const at = remaining.indexOf(targetId);

  if (at === -1) {
    // The target *was* the dragged row — it was removed above, so there is
    // no gap to name. Dropping a row on itself moves nothing.
    return { afterId: null, beforeId: null };
  }

  if (position === "above") {
    const afterId = at === 0 ? null : remaining[at - 1];
    return { afterId: afterId ?? null, beforeId: targetId };
  }

  const beforeId = at === remaining.length - 1 ? null : remaining[at + 1];
  return { afterId: targetId, beforeId: beforeId ?? null };
}

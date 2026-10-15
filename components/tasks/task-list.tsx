"use client";

/**
 * "Today's Focus" — Task 10.
 *
 * The right column's panel exactly as `docs/design/code.html` composes it:
 * header with a count, the inline add pill, the list, and — because PRD §4.2
 * requires it and the design does not draw it — "Clear completed" beneath the
 * list (ADR-004: required functionality is expressed *inside* the
 * two-column composition).
 *
 * The list is presentational: it takes rows and four callbacks and owns only
 * drag state. The Convex binding lives one file over, in `task-panel.tsx`,
 * which is what lets everything below the mutation boundary be tested in
 * jsdom without a backend — jsdom has no layout, so the rectangle maths
 * stays here but the *decision* (`lib/task-order.ts`) does not.
 *
 * No `border-b`, no `divide-*`, no `<hr>` anywhere: separation is the tonal
 * shift between `surface` and `surface-container-low` plus 12px of margin,
 * per DESIGN.md's no-line rule.
 */

import { useState, type DragEvent } from "react";

import { dropNeighbours, type DropPosition } from "@/lib/task-order";

import { TaskInput } from "./task-input";
import { TaskItem, type TaskRow } from "./task-item";

// Re-exported because `tasks` is half of `TaskListProps`: a consumer
// building a row list should not have to know which file the type was
// declared in to use the component.
export type { TaskRow };

interface TaskListProps<Id extends string> {
  tasks: readonly TaskRow<Id>[];
  onCreate: (title: string, estimate: number) => void;
  onToggle: (id: Id, next: boolean) => void;
  onReorder: (draggedId: Id, afterId: Id | null, beforeId: Id | null) => void;
  onClearCompleted: () => void;
  /**
   * False while the anonymous identity is still being established.
   *
   * Only the add pill needs it: the list gate means there are no rows to
   * toggle or drag until the session exists, so this is the one control a
   * visitor can reach while they still have no owner. A task typed into a
   * dead field is worse than a field that says plainly it is not ready.
   */
  ready?: boolean;
}

interface Hint<Id extends string> {
  targetId: Id;
  position: DropPosition;
}

export function TaskList<Id extends string>({
  tasks,
  onCreate,
  onToggle,
  onReorder,
  onClearCompleted,
  ready = true,
}: TaskListProps<Id>) {
  const [draggedId, setDraggedId] = useState<Id | null>(null);
  const [hint, setHint] = useState<Hint<Id> | null>(null);

  const open = tasks.filter((task) => !task.done);
  const finished = tasks.filter((task) => task.done);
  const openIds = open.map((task) => task.id);
  const openIdSet = new Set(openIds);

  function hover(targetId: Id, position: DropPosition) {
    // A drop that passes over the finished rows on its way to the bottom of
    // the list means "past the last open task", not "somewhere in the
    // completed section" — which has no order of its own, since Task 9
    // refuses to reorder across that boundary.
    if (openIdSet.has(targetId)) {
      setHint({ targetId, position });
      return;
    }
    const lastOpen = openIds[openIds.length - 1];
    setHint(
      lastOpen === undefined
        ? null
        : { targetId: lastOpen, position: "below" },
    );
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dragged = draggedId;
    const landed = hint;
    setDraggedId(null);
    setHint(null);

    if (dragged === null || landed === null) {
      return; // dropped with no gap ever hovered — nothing to move
    }

    const { afterId, beforeId } = dropNeighbours(
      openIds,
      dragged,
      landed.targetId,
      landed.position,
    );
    if (afterId === null && beforeId === null) {
      return; // no gap between two rows — see `lib/task-order.ts`
    }
    onReorder(dragged, afterId, beforeId);
  }

  return (
    <section aria-label="Today's Focus">
      <div className="mb-6 flex items-end justify-between">
        <h2 className="text-2xl font-bold tracking-tight text-on-surface">
          Today&apos;s Focus
        </h2>
        <span className="font-mono text-xs text-on-surface-variant">
          {finished.length} / {tasks.length} COMPLETED
        </span>
      </div>

      <TaskInput onCreate={onCreate} ready={ready} />

      <div
        role="list"
        aria-label="Task list"
        onDragOver={(event) => event.preventDefault()}
        onDrop={drop}
        className="space-y-3"
      >
        {/* Open rows first, then finished: the list owns that grouping
            because finished rows have no order of their own — Task 9
            reorders only within `activeFlag`. */}
        {[...open, ...finished].map((row) => (
          <TaskItem
            key={String(row.id)}
            row={row}
            dragging={draggedId !== null && row.id === draggedId}
            onToggle={onToggle}
            onDragStart={(id) => setDraggedId(id)}
            onDragOver={hover}
            onDragEnd={() => {
              setDraggedId(null);
              setHint(null);
            }}
          />
        ))}
      </div>

      {/* PRD §4.2's bulk action. Never hidden — an action that disappears
          teaches people it is unreliable — but inert until there is
          something it could clear. */}
      <button
        type="button"
        onClick={onClearCompleted}
        disabled={finished.length === 0}
        className="mt-6 rounded-lg px-3 py-2 text-xs font-medium text-on-surface transition-colors hover:bg-surface-container-high focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-30"
      >
        Clear completed
      </button>
    </section>
  );
}

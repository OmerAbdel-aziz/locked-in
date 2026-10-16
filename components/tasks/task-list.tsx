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
 * The list is presentational: it takes rows and five callbacks and owns only
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
import type { PickerProject } from "@/components/projects/picker";

// Re-exported because `tasks` is half of `TaskListProps`: a consumer
// building a row list should not have to know which file the type was
// declared in to use the component.
export type { TaskRow };

interface TaskListProps<Id extends string> {
  tasks: readonly TaskRow<Id>[];
  /**
   * The picked project travels with the create: `undefined` (or no picker
   * shown) files the task unassigned, matching the design's untagged row.
   * Stringly-typed on purpose — this is a *project* id in a component
   * generic over *task* ids, and threading a second generic through the
   * list for one optional argument would tax every caller for no safety
   * the mutation's own validator doesn't already provide.
   */
  onCreate: (title: string, estimate: number, projectId?: string) => void;
  onToggle: (id: Id, next: boolean) => void;
  onReorder: (draggedId: Id, afterId: Id | null, beforeId: Id | null) => void;
  onClearCompleted: () => void;
  /**
   * Selects which task receives focus sessions — PRD §4.1. Called with the
   * row's own id; whether that *clears* a selection already on it is the
   * panel's call, not the list's, because it is the panel that knows the
   * server's answer.
   */
  onSelect: (id: Id) => void;
  /**
   * False while the anonymous identity is still being established.
   *
   * Only the add pill needs it: the list gate means there are no rows to
   * toggle or drag until the session exists, so this is the one control a
   * visitor can reach while they still have no owner. A task typed into a
   * dead field is worse than a field that says plainly it is not ready.
   */
  ready?: boolean;
  /**
   * Active projects for the add pill's picker (Task 13). Absent — the
   * default — means no picker: the query hasn't settled (or the caller is a
   * test that doesn't care), and a picker that can only offer nothing is
   * worse than none.
   */
  projects?: readonly PickerProject[];
  /** The picker's controlled value; `null` files the next task unassigned. */
  pickerProjectId?: string | null;
  onPickerProjectChange?: (id: string | null) => void;
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
  onSelect,
  ready = true,
  projects,
  pickerProjectId = null,
  onPickerProjectChange,
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

      <TaskInput
        onCreate={onCreate}
        ready={ready}
        projects={projects}
        projectId={pickerProjectId}
        onProjectChange={
          onPickerProjectChange === undefined ? undefined : onPickerProjectChange
        }
      />

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
            onSelect={onSelect}
            onDragStart={(id) => setDraggedId(id)}
            onDragOver={hover}
            onDragEnd={() => {
              setDraggedId(null);
              setHint(null);
            }}
          />
        ))}
      </div>

      {/* Calm empty state (audit 2026-10-16): an empty panel is a void
          with a disabled button in it. One guidance line, no new surface,
          no fabricated numbers — it leaves with the first task. */}
      {tasks.length === 0 ? (
        <p className="rounded-xl bg-surface-container-low/50 px-4 py-6 text-center text-sm text-on-surface-variant/70">
          No tasks yet — add your first above to start collecting leaves.
        </p>
      ) : null}

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

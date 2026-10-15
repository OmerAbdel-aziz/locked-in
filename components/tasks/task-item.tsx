"use client";

/**
 * One row in "Today's Focus" — Task 10.
 *
 * Follows `docs/design/code.html` for the two states it draws: an open task
 * (tonal pill, outlined checkbox, mono leaf count, hover-revealed drag
 * handle) and a completed one (`surface-container-lowest`, `opacity-40`,
 * strikethrough, and no handle — finished rows are not somewhere you drag,
 * which is also what Task 9's open/completed boundary rule expects).
 *
 * The green left border is the design's active-task marker. It renders from
 * `row.isActive`, which nothing sets yet: PRD §4.2 makes it the *selected*
 * task and selection needs `activeTaskId`, which Task 11 introduces. Drawing
 * it on an arbitrary row would invent a selection nobody made.
 */

import type { DropPosition } from "@/lib/task-order";

import { CheckIcon, DragHandleIcon } from "./task-icons";

/** What the panel hands the list: a task, flattened to what a row shows. */
export interface TaskRow<Id extends string = string> {
  id: Id;
  title: string;
  /** PRD §4.2's leaf estimate, 0–8. */
  estimate: number;
  done: boolean;
  /**
   * Focus sessions recorded against this task. Derived from the session log
   * (ADR-003) — it is `0` until Task 11 binds sessions to tasks, which is
   * its own acceptance criterion; nothing here may store the count.
   */
  completedLeaves: number;
  /** The selected task, once Task 11 introduces `activeTaskId`. */
  isActive: boolean;
  /** Rendered inline beside the title; `null` while no project exists (Task 13). */
  projectName: string | null;
}

interface TaskItemProps<Id extends string> {
  row: TaskRow<Id>;
  /** True while this row is the one being dragged. */
  dragging: boolean;
  onToggle: (id: Id, next: boolean) => void;
  onDragStart: (id: Id) => void;
  onDragOver: (id: Id, position: DropPosition) => void;
  onDragEnd: () => void;
}

export function TaskItem<Id extends string>({
  row,
  dragging,
  onToggle,
  onDragStart,
  onDragOver,
  onDragEnd,
}: TaskItemProps<Id>) {
  const shell = row.done
    ? "bg-surface-container-lowest opacity-40"
    : "bg-surface-container-low/50 hover:bg-surface-container-low";

  const checkbox = row.done
    ? "flex size-5 shrink-0 items-center justify-center rounded bg-primary text-on-primary"
    : "flex size-5 shrink-0 items-center justify-center rounded border border-outline-variant text-transparent transition-colors group-hover:border-primary";

  return (
    <div
      role="listitem"
      data-task-id={String(row.id)}
      draggable={!row.done}
      onDragStart={(event) => {
        // Firefox refuses to start a drag unless something has been written
        // to the transfer; Chrome does not care either way. The list does not
        // read it back — it tracks the dragged id in state — this is only the
        // permission slip.
        if (event.dataTransfer) {
          event.dataTransfer.setData("text/plain", String(row.id));
          event.dataTransfer.effectAllowed = "move";
        }
        onDragStart(row.id);
      }}
      onDragOver={(event) => {
        // Allowing the drop everywhere — including over finished rows, where
        // the list translates the hover into "past the last open task" — is
        // what makes dropping at the end of the list work when the cursor
        // passes over the completed section on its way there.
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        const position: DropPosition =
          event.clientY < rect.top + rect.height / 2 ? "above" : "below";
        onDragOver(row.id, position);
      }}
      onDragEnd={onDragEnd}
      className={`group flex cursor-grab items-center justify-between rounded-xl p-4 transition-colors active:cursor-grabbing ${shell}${
        row.isActive ? " border-l-2 border-primary" : ""
      }${dragging ? " opacity-40" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        <button
          type="button"
          role="checkbox"
          aria-checked={row.done}
          aria-label={`${row.done ? "Uncomplete" : "Complete"} ${row.title}`}
          onClick={() => onToggle(row.id, !row.done)}
          className={checkbox}
        >
          {row.done ? <CheckIcon className="size-3.5" /> : null}
        </button>

        {/* `code.html` recedes a finished row with `opacity-40` on the pill
            and a strikethrough on the title, and overrides no colours — the
            screenshot is legible precisely because the fade is applied once.
            PRD §4.2 names the same two mechanisms. */}
        <span
          className={`min-w-0 truncate text-sm font-medium text-on-surface${
            row.done ? " line-through" : ""
          }`}
        >
          {row.title}
        </span>

        {/* PRD §4.1 requires the tag; the design has no place for it, so it
            rides inline beside the title rather than claiming its own column. */}
        {row.projectName === null ? null : (
          <span className="shrink-0 rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant">
            {row.projectName}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`font-mono text-[10px]${
            row.done ? "" : " text-on-surface-variant"
          }`}
        >
          {row.completedLeaves}/{row.estimate}
        </span>
        {row.done ? null : (
          <DragHandleIcon className="size-3.5 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-40 hover:opacity-100" />
        )}
      </div>
    </div>
  );
}

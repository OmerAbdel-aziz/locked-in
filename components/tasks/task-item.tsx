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
 * The green left border is the design's active-task marker — `code.html`
 * draws exactly `border-l-2 border-primary` on the row and nothing else —
 * and it renders from `row.isActive`, which the panel sets from the owner's
 * `activeTaskId` (Task 11).
 *
 * Clicking a row selects it (PRD §4.1), except on the checkbox: completing
 * a task and selecting it are two different decisions, and one control doing
 * both would make ticking a box silently re-aim the running timer.
 */

import type { DropPosition } from "@/lib/task-order";

import { Checkbox } from "@heroui/react";

import { CheckIcon, DragHandleIcon } from "./task-icons";

/** What the panel hands the list: a task, flattened to what a row shows. */
export interface TaskRow<Id extends string = string> {
  id: Id;
  title: string;
  /** PRD §4.2's leaf estimate, 0–8. */
  estimate: number;
  done: boolean;
  /**
   * Focus sessions recorded against this task, derived from the session log
   * on read (ADR-003) — nothing here may store the count. It may legitimately
   * exceed `estimate`: a task that is finished keeps receiving focus time
   * until another is selected (Task 11).
   */
  completedLeaves: number;
  /** The selected task — PRD §4.1's `activeTaskId`, drawn as the green rail. */
  isActive: boolean;
  /** Rendered inline beside the title; `null` while no project exists (Task 13). */
  projectName: string | null;
  /**
   * Which project the tag names — the filter's join key (Task 13). Optional
   * because rows built before projects existed carry no id; absent reads as
   * unassigned, the same honest default the panel shows while queries settle.
   */
  projectId?: string | null;
  /** True when the named project is archived — the tag renders muted. */
  projectArchived?: boolean;
}

interface TaskItemProps<Id extends string> {
  row: TaskRow<Id>;
  /** True while this row is the one being dragged. */
  dragging: boolean;
  onToggle: (id: Id, next: boolean) => void;
  /** Selects (or, on the active row, clears) which task receives sessions. */
  onSelect: (id: Id) => void;
  onDragStart: (id: Id) => void;
  onDragOver: (id: Id, position: DropPosition) => void;
  onDragEnd: () => void;
}

export function TaskItem<Id extends string>({
  row,
  dragging,
  onToggle,
  onSelect,
  onDragStart,
  onDragOver,
  onDragEnd,
}: TaskItemProps<Id>) {
  const shell = row.done
    ? "bg-surface-container-lowest opacity-40"
    : "bg-surface-container-low/50 hover:bg-surface-container-low";

  const checkbox = row.done
    ? "bg-primary text-on-primary"
    : "border border-outline-variant text-transparent transition-colors group-hover:border-primary";

  return (
    <div
      role="listitem"
      data-task-id={String(row.id)}
      draggable={!row.done}
      // PRD §4.1: "clicking a task selects it". A drag does not reach here —
      // browsers suppress the click that would follow a completed drop — so
      // a reordering gesture cannot double as a selection.
      onClick={() => onSelect(row.id)}
      onKeyDown={(event) => {
        // Only when the row itself holds focus. Enter/Space landing on the
        // checkbox *inside* it must not also select: a keydown still bubbles
        // even though that button's click is stopped below, so the guard is
        // the target rather than the event.
        if (event.target !== event.currentTarget) {
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(row.id);
        }
      }}
      // Focusable so a decision this consequential — it chooses what the
      // running timer will credit — is reachable without a pointer. PRD
      // describes the gesture as a click, not as a mouse-only feature.
      tabIndex={0}
      // The selection state, in a form assistive tech reports on a listitem
      // without inventing a listbox the design never asked for.
      aria-current={row.isActive ? "true" : undefined}
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
      className={`group flex cursor-grab items-center justify-between rounded-xl p-4 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 active:cursor-grabbing ${shell}${
        row.isActive ? " border-l-2 border-primary" : ""
      }${dragging ? " opacity-40" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-4">
        {/* HeroUI Checkbox (PRD D6a). The stopPropagation stays: completing
            must not also select — the row above owns selection, and one
            control making both decisions would mean ticking the active task
            silently re-aims what the running timer credits. Stopping at a
            wrapper (rather than inside HeroUI's slots) keeps the guarantee
            independent of the library's internal structure. */}
        <span
          onClick={(event) => {
            event.stopPropagation();
          }}
          className="flex shrink-0"
        >
          <Checkbox
            isSelected={row.done}
            onChange={() => onToggle(row.id, !row.done)}
            aria-label={`${row.done ? "Uncomplete" : "Complete"} ${row.title}`}
          >
            <Checkbox.Content>
              <Checkbox.Control
                className={`flex size-5 items-center justify-center rounded ${checkbox}`}
              >
                {/* Render function, not static children: static `null`
                    children would fall through to HeroUI's default
                    checkmark SVG, leaving a hidden-but-present mark in
                    every unchecked box. */}
                <Checkbox.Indicator>
                  {({ isSelected }: { isSelected: boolean }) =>
                    isSelected ? <CheckIcon className="size-3.5" /> : null
                  }
                </Checkbox.Indicator>
              </Checkbox.Control>
            </Checkbox.Content>
          </Checkbox>
        </span>

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
            rides inline beside the title rather than claiming its own column.
            A task of an archived project keeps the tag, muted — the archive
            hides the project, never the attribution (Task 13). */}
        {row.projectName === null ? null : (
          <span
            className={`shrink-0 rounded bg-surface-container-highest px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-on-surface-variant${
              row.projectArchived === true ? " opacity-50" : ""
            }`}
            title={
              row.projectArchived === true
                ? `${row.projectName} (archived)`
                : undefined
            }
          >
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

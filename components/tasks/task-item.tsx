"use client";

/**
 * One row in "Today's Focus" — Task 10, extended in the Phase 9 polish with
 * edit + delete (human-directed: PRD §4.2 had no way back from a typo).
 *
 * Follows `docs/design/code.html` for the two states it draws: an open task
 * (tonal pill, outlined checkbox, mono leaf count, hover-revealed drag
 * handle) and a completed one (`surface-container-lowest`, `opacity-40`,
 * strikethrough, and no handle — finished rows are not somewhere you drag,
 * which is also what Task 9's open/completed boundary rule expects).
 *
 * The active task reads by tone, from `row.isActive` (the panel sets it from
 * the owner's `activeTaskId`, Task 11): the row lifts to the strongest
 * surface step — the same selected-state language the segmented controls
 * use. No colored edge rail: selection is a tonal fill, never a line.
 *
 * Clicking a row selects it (PRD §4.1), except on the checkbox: completing
 * a task and selecting it are two different decisions, and one control doing
 * both would make ticking a box silently re-aim the running timer. Edit and
 * delete stop propagation for the same reason — they are row maintenance,
 * not a claim about where the next session should land.
 *
 * Edit mode swaps the row's content for the same three fields the add pill
 * takes (title, leaves, project), so every field the mutation accepts is
 * reachable — a title-only editor would leave the estimate unfixable, which
 * is half the complaint that produced this. Empty title cancels the edit
 * (the project manager's stance on an empty rename); Escape cancels, Enter
 * saves.
 */

import { useState, type KeyboardEvent } from "react";

import type { DropPosition } from "@/lib/task-order";

import { Checkbox, Button, Input, Label, ListBox, Select, TextField } from "@heroui/react";

import type { PickerProject } from "@/components/projects/picker";
import { ProjectPicker } from "@/components/projects/picker";

import { CheckIcon, DragHandleIcon, EditIcon, TrashIcon } from "./task-icons";
import { ESTIMATES } from "./task-input";

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

/** The edit form's draft — exactly the fields `tasks.update` accepts. */
export interface TaskPatch {
  title: string;
  estimate: number;
  /** `null` unbinds the task from its project. */
  projectId: string | null;
}

interface TaskItemProps<Id extends string> {
  row: TaskRow<Id>;
  /** True while this row is the one being dragged. */
  dragging: boolean;
  onToggle: (id: Id, next: boolean) => void;
  /** Selects (or, on the active row, clears) which task receives sessions. */
  onSelect: (id: Id) => void;
  /** Saves an edit. The panel casts the string project id back to its brand. */
  onUpdate: (id: Id, patch: TaskPatch) => void;
  /** Deletes the row outright — history survives, only the label goes. */
  onRemove: (id: Id) => void;
  /**
   * Active projects for the edit form's picker — the same list the add pill
   * uses, so an edit can file a task into a project a create could. Absent
   * (tests, or the query still settling) renders no picker.
   */
  projects?: readonly PickerProject[];
  onDragStart: (id: Id) => void;
  onDragOver: (id: Id, position: DropPosition) => void;
  onDragEnd: () => void;
}

export function TaskItem<Id extends string>({
  row,
  dragging,
  onToggle,
  onSelect,
  onUpdate,
  onRemove,
  projects,
  onDragStart,
  onDragOver,
  onDragEnd,
}: TaskItemProps<Id>) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(row.title);
  const [draftEstimate, setDraftEstimate] = useState(row.estimate);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(
    row.projectId ?? null,
  );

  const shell = row.done
    ? "bg-surface-container-lowest opacity-40"
    : row.isActive
      ? "bg-surface-container-highest"
      : "bg-surface-container-low/50 hover:bg-surface-container-low";

  const checkbox = row.done
    ? "bg-primary text-on-primary"
    : "border border-outline-variant text-transparent transition-colors group-hover:border-primary";

  function beginEdit() {
    // Seed from the row at the moment the pencil lands: a draft that kept
    // stale fields across a reactive update would save yesterday's task.
    setDraftTitle(row.title);
    setDraftEstimate(row.estimate);
    setDraftProjectId(row.projectId ?? null);
    setEditing(true);
  }

  function commitEdit() {
    const title = draftTitle.trim();
    // An empty title cancels the edit — a task called "" is not an edit
    // anyone meant (same stance as the project manager's empty rename).
    if (title.length > 0) {
      onUpdate(row.id, {
        title,
        estimate: draftEstimate,
        projectId: draftProjectId,
      });
    }
    setEditing(false);
  }

  function editKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit();
    } else if (event.key === "Escape") {
      setEditing(false);
    }
  }

  return (
    <div
      role="listitem"
      data-task-id={String(row.id)}
      data-editing={editing ? "true" : "false"}
      // Editing freezes the row: no drag mid-edit (the drop would move a
      // row whose fields are half-typed), no select-on-click (the edit
      // controls live inside), no keyboard-select either.
      draggable={!row.done && !editing}
      // PRD §4.1: "clicking a task selects it". A drag does not reach here —
      // browsers suppress the click that would follow a completed drop — so
      // a reordering gesture cannot double as a selection.
      onClick={() => {
        if (!editing) {
          onSelect(row.id);
        }
      }}
      onKeyDown={(event) => {
        // Only when the row itself holds focus. Enter/Space landing on the
        // checkbox *inside* it must not also select: a keydown still bubbles
        // even though that button's click is stopped below, so the guard is
        // the target rather than the event.
        if (editing || event.target !== event.currentTarget) {
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
      className={`group flex cursor-grab items-center justify-between gap-2 rounded-xl p-4 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 active:cursor-grabbing ${shell}${
        dragging ? " opacity-40" : ""
      }${editing ? " cursor-default" : ""}`}
    >
      {editing ? (
        // The edit form: the add pill's three fields, minus the icon and the
        // submit-by-Enter wrapper (this row *is* the form; Enter is handled
        // on the title input so the selects stay usable).
        <div
          className="flex w-full min-w-0 flex-wrap items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <TextField
            aria-label={`Edit title of ${row.title}`}
            value={draftTitle}
            onChange={setDraftTitle}
            className="min-w-40 flex-1"
          >
            <Input
              autoFocus
              onKeyDown={editKeys}
              className="min-w-0 flex-1 rounded-lg bg-surface-container-highest px-3 py-1.5 text-sm text-on-surface transition-all focus:outline-none"
            />
          </TextField>

          <Select
            selectedKey={String(draftEstimate)}
            onSelectionChange={(key) => setDraftEstimate(Number(key))}
          >
            {/* Inside the Select (see picker.tsx): the trigger's accessible
                name is the composed [value, label] — "4 Leaves". Without it
                the button announces only its number. */}
            <Label className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/70">
              Leaves
            </Label>
            <Select.Trigger
              type="button"
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-surface-container-highest py-1.5 pl-2.5 pr-2 font-mono text-[11px] text-on-surface transition-colors hover:text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            >
              <Select.Value />
              <Select.Indicator className="size-2.5 shrink-0 text-on-surface-variant/60" />
            </Select.Trigger>
            <Select.Popover className="rounded-xl bg-surface-container-high p-1">
              <ListBox className="font-mono text-[11px] text-on-surface">
                {ESTIMATES.map((leaves) => (
                  <ListBox.Item
                    key={leaves}
                    id={String(leaves)}
                    className="cursor-pointer rounded-lg px-2.5 py-1.5 outline-none focus-visible:bg-surface-container-highest"
                  >
                    {leaves}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          {projects === undefined ? null : (
            <ProjectPicker
              projects={projects}
              value={draftProjectId}
              onChange={setDraftProjectId}
            />
          )}

          <span className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="primary"
              onPress={commitEdit}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onPress={() => setEditing(false)}
            >
              Cancel
            </Button>
          </span>
        </div>
      ) : (
        <>
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

          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={`font-mono text-[10px]${
                row.done ? "" : " text-on-surface-variant"
              }`}
            >
              {row.completedLeaves}/{row.estimate}
            </span>
            {/* Edit + delete: same hover reveal as the handle. Deleting is
                immediate, matching "Clear completed" — the sessions survive
                unbound (ADR-003), so the destructive part is the label. */}
            <span
              onClick={(event) => {
                event.stopPropagation();
              }}
              className="flex shrink-0 items-center gap-1"
            >
              <Button
                type="button"
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`Edit ${row.title}`}
                onPress={() => beginEdit()}
              >
                <EditIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                isIconOnly
                size="sm"
                variant="ghost"
                aria-label={`Delete ${row.title}`}
                onPress={() => onRemove(row.id)}
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </span>
            {row.done ? null : (
              <DragHandleIcon className="ml-0.5 size-3.5 text-on-surface-variant opacity-0 transition-opacity group-hover:opacity-40" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

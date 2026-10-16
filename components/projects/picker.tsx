"use client";

/**
 * The project picker — Task 13, PRD §4.2's "project assignment (optional,
 * from the projects picker)", rewritten onto HeroUI Select in the Phase 9
 * polish (the native `<select>` era is over — human instruction).
 *
 * HeroUI mapping (PRD D6a): Select + ListBox, same tonal pill as the leaf
 * selector beside it — no border, no new surface (DESIGN.md no-line rule).
 * The trigger sits inside the add-pill `<form>`, so it carries
 * `type="button"`: opening a dropdown must never submit the form.
 *
 * Only *active* projects are offered: filing a new task under an archived
 * project would birth it under a muted tag with no chip selecting it in some
 * views, which reads as the task vanishing. The acceptance criterion names
 * exactly this hiding; archived rows stay visible on old tasks, never as new
 * destinations.
 *
 * Pure: options in, selection out. The panel owns the value, because the
 * value feeds `tasks.create` directly. "No project" is a real item under the
 * sentinel key `NO_PROJECT`, so the trigger always shows a chosen state
 * rather than an empty box.
 */

import { Label, ListBox, Select } from "@heroui/react";

export interface PickerProject {
  id: string;
  name: string;
}

/** Key for the "file it unassigned" item — real project ids can't collide. */
const NO_PROJECT = "__no_project__";

interface ProjectPickerProps {
  /** Active projects only — see header. `undefined` is never passed: the
   *  caller renders no picker at all until the list query settles. */
  projects: readonly PickerProject[];
  /** `null` files the next task unassigned, matching the design's untagged row. */
  value: string | null;
  onChange: (id: string | null) => void;
  /** False while the anonymous identity is still being established — same
   *  gate as the title field and the leaf selector beside it. */
  disabled?: boolean;
}

export function ProjectPicker({
  projects,
  value,
  onChange,
  disabled = false,
}: ProjectPickerProps) {
  return (
    <Select
      selectedKey={value ?? NO_PROJECT}
      onSelectionChange={(key) =>
        onChange(key === NO_PROJECT || key == null ? null : String(key))
      }
      isDisabled={disabled}
      className="flex shrink-0 items-center gap-2 pr-3"
    >
      {/* The visible label must live INSIDE the Select: react-aria's root
          provides the Label context, and the trigger's accessible name is
          composed as [label, value] — "Project Ship Q2". A label outside
          the tree is invisible to that composition, and aria-label loses
          to the value's aria-labelledby. */}
      <Label className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/70">
        Project
      </Label>
      <Select.Trigger
        type="button"
        className="flex max-w-32 cursor-pointer items-center gap-1.5 rounded-lg bg-surface-container-highest py-1.5 pl-2.5 pr-2 font-mono text-[11px] text-on-surface transition-colors hover:text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
      >
        <Select.Value className="truncate" />
        <Select.Indicator className="size-2.5 shrink-0 text-on-surface-variant/60" />
      </Select.Trigger>
      <Select.Popover className="rounded-xl bg-surface-container-high p-1">
        <ListBox className="text-[11px] font-mono text-on-surface">
          <ListBox.Item
            id={NO_PROJECT}
            className="cursor-pointer rounded-lg px-2.5 py-1.5 text-on-surface-variant outline-none focus-visible:bg-surface-container-highest focus-visible:text-on-surface"
          >
            No project
          </ListBox.Item>
          {projects.map((project) => (
            <ListBox.Item
              key={project.id}
              id={project.id}
              // The name rides in a truncate span (non-plain text), which
              // react-aria requires a textValue alongside for its type-to-
              // select and accessibility bookkeeping.
              textValue={project.name}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 outline-none focus-visible:bg-surface-container-highest"
            >
              <span className="truncate">{project.name}</span>
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

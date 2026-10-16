"use client";

/**
 * The inline "Add new task…" row — Task 10, rewritten onto HeroUI in
 * Phase 3.5d.
 *
 * The design draws the input alone (its screen has no estimate control), but
 * PRD §4.2 requires a pomodoro estimate "leaf selector, 0–8, default 2" on
 * creation, and ADR-004 puts required functionality *inside* the two-column
 * composition rather than beside it. So the selector sits at the right end of
 * the same tonal pill: same container, same focus ring, no new surface and —
 * per DESIGN.md's no-line rule — no border separating it from the field.
 *
 * The project picker from PRD §4.2 is deliberately absent: there are no
 * projects to pick until Task 13, and a control that can only ever offer
 * nothing is worse than one that arrives complete.
 *
 * HeroUI mapping (PRD D6a): the text field is TextField + Input. The leaf
 * 0–8 selector stays a native `<select>` — HeroUI ships no compact
 * number-picker, and a full Select dropdown for nine single digits would be
 * chrome the design never asked for. The `<form>` wrapper stays: it owns the
 * submit (Enter key) contract the list relies on.
 */

import { useState, type FormEvent } from "react";
import { Input, TextField } from "@heroui/react";

import {
  ProjectPicker,
  type PickerProject,
} from "@/components/projects/picker";
import { AddIcon } from "./task-icons";

/** PRD §4.2: default estimate, and the inclusive range it must sit in. */
export const DEFAULT_ESTIMATE = 2;
export const MAX_ESTIMATE = 8;

export const ESTIMATES = Array.from(
  { length: MAX_ESTIMATE + 1 },
  (_, leaves) => leaves,
);

interface TaskInputProps {
  /** Called with a non-empty trimmed title, the chosen estimate, and the
   *  picked project (absent while no picker is shown, or "No project"). */
  onCreate: (title: string, estimate: number, projectId?: string) => void;
  /**
   * False while the anonymous identity is still being established.
   *
   * A task typed during that window has no owner to be created under, so
   * the server rejects it — and a field that accepts the text and then
   * discards it is worse than one that is plainly not ready yet. The pill
   * keeps its shape either way, so nothing shifts when it comes to life.
   */
  ready?: boolean;
  /**
   * Active projects for the picker (Task 13). `undefined` — the default —
   * renders no picker at all: there is nothing to pick until the list query
   * settles, and a control that can only ever offer nothing is worse than
   * one that arrives complete.
   */
  projects?: readonly PickerProject[];
  /** The picker's controlled value; `null` files the next task unassigned. */
  projectId?: string | null;
  onProjectChange?: (id: string | null) => void;
}

export function TaskInput({
  onCreate,
  ready = true,
  projects,
  projectId = null,
  onProjectChange,
}: TaskInputProps) {
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState(DEFAULT_ESTIMATE);

  function submit(event: FormEvent) {
    event.preventDefault();

    // The disabled attribute on the field is the *visible* half of this;
    // this guard is the actual one. `disabled` stops the gestures a browser
    // routes through the control, but a form submit can still arrive by
    // other means — and a task created with no owner behind it is a write
    // the server rejects. Refusing here means the guarantee does not depend
    // on which path reached the handler.
    if (!ready) {
      return;
    }

    const trimmed = title.trim();
    if (trimmed.length === 0) {
      return;
    }
    // `null` (No project) travels as "no argument", which is what
    // `tasks.create` reads as unassigned — the same absence an untagged row
    // has always carried.
    onCreate(trimmed, estimate, projectId ?? undefined);
    // The field empties for the next entry and keeps focus, so a short list
    // can be typed in one pass. The estimate deliberately stays where the
    // user left it: snapping back to 2 mid-list would quietly file the rest
    // of them under a number that was never chosen.
    setTitle("");
  }

  return (
    <form className="group relative mb-6" onSubmit={submit}>
      <div className="flex items-center rounded-xl bg-surface-container-low transition-all focus-within:ring-1 focus-within:ring-primary/30">
        <AddIcon className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-on-surface-variant/40 transition-colors group-focus-within:text-primary" />

        <TextField
          aria-label="New task title"
          value={title}
          onChange={setTitle}
          isDisabled={!ready}
          className="min-w-0 flex-1"
        >
          <Input
            placeholder="Add new task..."
            className="min-w-0 flex-1 bg-transparent py-4 pl-12 pr-2 text-sm text-on-surface transition-all placeholder:text-on-surface-variant/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          />
        </TextField>

        <label className="flex shrink-0 items-center gap-2 pr-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/70">
            Leaves
          </span>
          <span className="relative flex items-center">
            <select
              value={estimate}
              onChange={(event) => setEstimate(Number(event.target.value))}
              disabled={!ready}
              className="peer appearance-none cursor-pointer rounded-lg bg-surface-container-highest py-1.5 pl-2.5 pr-6 font-mono text-[11px] text-on-surface transition-colors hover:text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 [&>option]:bg-surface-container-highest [&>option]:text-on-surface"
            >
              {ESTIMATES.map((leaves) => (
                <option key={leaves} value={leaves}>
                  {leaves}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className="pointer-events-none absolute right-1.5 top-1/2 size-2.5 -translate-y-1/2 text-on-surface-variant/60"
            >
              <path
                d="M2 4.5 6 8.5 10 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </label>

        {/* The project picker (Task 13) rides the same pill, after the leaf
            selector: assignment is optional, so "No project" is the honest
            default and the control is absent entirely until projects exist. */}
        {projects === undefined || onProjectChange === undefined ? null : (
          <ProjectPicker
            projects={projects}
            value={projectId}
            onChange={onProjectChange}
            disabled={!ready}
          />
        )}
      </div>
    </form>
  );
}

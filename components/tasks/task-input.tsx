"use client";

/**
 * The inline "Add new task…" row — Task 10.
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
 */

import { useState, type FormEvent } from "react";

import { AddIcon } from "./task-icons";

/** PRD §4.2: default estimate, and the inclusive range it must sit in. */
export const DEFAULT_ESTIMATE = 2;
export const MAX_ESTIMATE = 8;

export const ESTIMATES = Array.from(
  { length: MAX_ESTIMATE + 1 },
  (_, leaves) => leaves,
);

interface TaskInputProps {
  /** Called with a non-empty trimmed title and the chosen estimate. */
  onCreate: (title: string, estimate: number) => void;
  /**
   * False while the anonymous identity is still being established.
   *
   * A task typed during that window has no owner to be created under, so
   * the server rejects it — and a field that accepts the text and then
   * discards it is worse than one that is plainly not ready yet. The pill
   * keeps its shape either way, so nothing shifts when it comes to life.
   */
  ready?: boolean;
}

export function TaskInput({ onCreate, ready = true }: TaskInputProps) {
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
    onCreate(trimmed, estimate);
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

        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add new task..."
          aria-label="New task title"
          disabled={!ready}
          className="min-w-0 flex-1 bg-transparent py-4 pl-12 pr-2 text-sm text-on-surface transition-all placeholder:text-on-surface-variant/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        />

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
      </div>
    </form>
  );
}

"use client";

/**
 * The project picker — Task 13, PRD §4.2's "project assignment (optional,
 * from the projects picker)".
 *
 * A native `<select>` beside the leaf selector in the add pill, deliberately:
 * the leaf 0–8 control stayed native in Phase 3.5d for the same reason — no
 * HeroUI compact picker exists, and a full dropdown for a handful of short
 * names would be chrome the design never asked for. Same container, same
 * focus ring, no new surface, no border between it and the field (DESIGN.md's
 * no-line rule).
 *
 * Only *active* projects are offered: filing a new task under an archived
 * project would birth it under a muted tag with no chip selecting it in some
 * views, which reads as the task vanishing. The acceptance criterion names
 * exactly this hiding; archived rows stay visible on old tasks, never as new
 * destinations.
 *
 * Pure: options in, selection out. The panel owns the value, because the
 * value feeds `tasks.create` directly.
 */

export interface PickerProject {
  id: string;
  name: string;
}

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
    <label className="flex shrink-0 items-center gap-2 pr-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-on-surface-variant/70">
        Project
      </span>
      <span className="relative flex items-center">
        <select
          aria-label="Project for the new task"
          value={value ?? ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? null : event.target.value)
          }
          disabled={disabled}
          className="peer max-w-32 truncate appearance-none cursor-pointer rounded-lg bg-surface-container-highest py-1.5 pl-2.5 pr-6 font-mono text-[11px] text-on-surface transition-colors hover:text-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 [&>option]:bg-surface-container-highest [&>option]:text-on-surface"
        >
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
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
  );
}

"use client";

/**
 * The task-list project filter — Task 13, PRD §4.1 "Projects".
 *
 * A chip row above the list: All, then one chip per project. Pure: it takes
 * the projects and the selection and reports clicks, so the filtering itself
 * (and the "All means no filter" reading) stays testable without Convex.
 * The panel owns the state, because it is the panel that already holds the
 * rows the filter applies to.
 *
 * Archived projects keep their chips, rendered muted: their tasks are still
 * on the board with muted tags, and hiding the chip would strand them with
 * no way to isolate them. The *picker* hides archived projects instead (a
 * new task filed under an archived project would be born hidden), which is
 * the distinction the acceptance criterion draws.
 *
 * HeroUI mapping (PRD D6a): chips are Buttons — the proven `variant="ghost"`
 * + `onPress` shape from the timer controls — rather than a new component,
 * because a filter chip is a small action, not a display tag.
 */

import { Button } from "@heroui/react";

export interface FilterProject {
  id: string;
  name: string;
  /** Archived projects render muted but stay selectable (see header). */
  archived: boolean;
}

interface ProjectFilterProps {
  projects: readonly FilterProject[];
  /** `null` is All — no filter, the whole board. */
  value: string | null;
  onChange: (id: string | null) => void;
}

export function ProjectFilter({ projects, value, onChange }: ProjectFilterProps) {
  // Nothing to filter by: the row would be one chip ("All") selecting
  // itself, which teaches nobody anything. The panel renders this only once
  // a project exists; the null keeps that contract explicit.
  if (projects.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Filter tasks by project"
      className="mb-4 flex flex-wrap gap-2"
    >
      <Button
        size="sm"
        variant={value === null ? "secondary" : "ghost"}
        aria-pressed={value === null}
        onPress={() => onChange(null)}
      >
        All
      </Button>

      {projects.map((project) => {
        const selected = value === project.id;
        return (
          <Button
            key={project.id}
            size="sm"
            variant={selected ? "secondary" : "ghost"}
            aria-pressed={selected}
            onPress={() => onChange(project.id)}
          >
            {project.name}
          </Button>
        );
      })}
    </div>
  );
}

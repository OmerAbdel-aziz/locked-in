/**
 * Per-project breakdown + top tasks — Task 19's aggregations, rendered.
 *
 * Two quiet lists, no charts: projects show focus time with a muted tag
 * (archived projects render at reduced opacity but keep their name — history
 * is never rewritten), tasks show focus time against the session count.
 * Pure views, no hooks.
 */

import type { ProjectSlice, TaskSlice } from "@/lib/aggregations";

function formatMinutes(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  return `${(minutes / 60).toFixed(1)}h`;
}

export function PerProjectView({ slices }: { slices: ProjectSlice[] }) {
  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Focus by project
      </p>
      {slices.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Nothing yet</p>
      ) : (
        <ul className="space-y-2">
          {slices.map((slice) => (
            <li
              key={slice.projectId ?? "none"}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span
                className={`truncate rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface ${
                  slice.archived ? "opacity-60" : ""
                }`}
              >
                {slice.name}
              </span>
              <span className="shrink-0 font-mono text-on-surface-variant">
                {formatMinutes(slice.focusMs)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TopTasksView({ slices }: { slices: TaskSlice[] }) {
  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Top tasks
      </p>
      {slices.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Nothing yet</p>
      ) : (
        <ul className="space-y-2">
          {slices.map((slice) => (
            <li
              key={slice.taskId}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="truncate text-on-surface">{slice.title}</span>
              <span className="shrink-0 font-mono text-on-surface-variant">
                {formatMinutes(slice.focusMs)} · {slice.sessions}{" "}
                {slice.sessions === 1 ? "session" : "sessions"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

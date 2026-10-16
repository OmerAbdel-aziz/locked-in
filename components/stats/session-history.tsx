/**
 * Session history list — Task 22, PRD §4.1 "reverse-chronological table of
 * sessions (start time, duration, phase, task, project) with day grouping".
 *
 * Read-only by construction: rows are text, there are no buttons, no links,
 * no edit affordances of any kind — CSV import is the repair path, so the
 * list offers none. Grouping respects the local day at *completion* (each
 * row's recorded offset, via `groupSessionsByDay`), and archived projects
 * still render by name, muted. Pure view, no hooks.
 */

import { groupSessionsByDay } from "@/lib/aggregations";
import { MS_PER_MINUTE } from "@/lib/aggregations";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `HH:MM` of an instant seen from the given UTC offset — hand-formatted so
 *  the output never depends on the runtime locale. */
export function formatLocalTime(
  instant: number,
  tzOffsetMinutes: number,
): string {
  const shifted = new Date(instant + tzOffsetMinutes * MS_PER_MINUTE);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(
    shifted.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

/** `Sat, Jun 1` for a `YYYY-MM-DD` day key — likewise locale-free. */
export function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${names[weekday]}, ${MONTHS[month - 1]} ${day}`;
}

export interface HistoryRow {
  startedAt: number;
  completedAt: number;
  phase: "focus" | "short" | "long";
  tzOffsetAtCompletion: number;
  taskTitle: string | null;
  projectName: string | null;
  projectArchived: boolean;
}

const PHASE_LABELS: Record<HistoryRow["phase"], string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
};

export function SessionHistoryView({ rows }: { rows: HistoryRow[] }) {
  const groups = groupSessionsByDay(rows);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.dayKey} aria-label={formatDayKey(group.dayKey)}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
            {formatDayKey(group.dayKey)}
          </p>
          <ul className="space-y-2">
            {group.sessions.map((session) => {
              const row = session as HistoryRow;
              const durationMin = Math.round(
                (row.completedAt - row.startedAt) / MS_PER_MINUTE,
              );
              return (
                <li
                  key={`${row.startedAt}-${row.completedAt}-${row.phase}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-container-low/30 px-4 py-3 text-sm"
                >
                  <span className="font-mono text-on-surface">
                    {formatLocalTime(
                      row.startedAt,
                      row.tzOffsetAtCompletion,
                    )}
                  </span>
                  <span className="font-mono text-on-surface-variant">
                    {durationMin}m
                  </span>
                  <span className="text-on-surface-variant">
                    {PHASE_LABELS[row.phase]}
                  </span>
                  <span className="truncate text-on-surface">
                    {row.taskTitle ?? "—"}
                  </span>
                  {row.projectName !== null && (
                    <span
                      className={`truncate rounded-full bg-surface-container-high px-2 py-0.5 text-xs text-on-surface ${
                        row.projectArchived ? "opacity-60" : ""
                      }`}
                    >
                      {row.projectName}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

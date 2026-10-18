"use client";

/**
 * Session history as Arc's Timeline (ADR-006) - Task 22's reverse-
 * chronological feed with day grouping, kept read-only.
 *
 * Arc's Timeline would group by the runtime's zone; sessions recorded
 * under their own offset cannot trust it. So each row is pre-shifted
 * into its recorded offset (`at = completedAt + offset`) and
 * `timeZone="UTC"` makes Arc's grouping and clock text resolve the
 * recorded local day and wall time exactly - no ICU guess, and identical
 * output on server and client.
 *
 * No row carries `detail`, so Arc renders triggers as `<div>`s: no
 * buttons, no links, no edit affordances of any kind - CSV import is the
 * repair path, and the list still offers none. Archived projects render
 * by name in the meta (history is never rewritten).
 */

import { Timeline } from "@/components/arc/timeline/timeline";

import {
  MS_PER_MINUTE,
  formatLocalTime,
  formatMinutesLong,
} from "./format";

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

export function SessionHistoryView({
  rows,
  now,
}: {
  rows: HistoryRow[];
  /** Reference clock for the Today/Yesterday day labels - the panel's quantised snapshot. */
  now: number;
}) {
  const events = rows.map((row, index) => {
    const shifted = row.completedAt + row.tzOffsetAtCompletion * MS_PER_MINUTE;
    const duration = Math.round(
      (row.completedAt - row.startedAt) / MS_PER_MINUTE,
    );
    return {
      id: `h${index}`,
      at: new Date(shifted).toISOString(),
      title: row.taskTitle ?? "Deleted task",
      meta: [
        formatLocalTime(row.startedAt, row.tzOffsetAtCompletion),
        formatMinutesLong(duration),
        PHASE_LABELS[row.phase],
        row.projectName ?? "No project",
      ].join(" \u00B7 "),
    };
  });

  return (
    <Timeline
      events={events}
      now={now}
      label="Session history"
      timeZone="UTC"
      headingLevel={3}
    />
  );
}

"use client";

/**
 * Top tasks as Arc's SortableDataTable (ADR-006), replacing the plain
 * `<ul>`. Sorting is the one affordance a read-only analysis page may
 * carry - like the plaque's own control, it re-orders existing numbers
 * and invents none. Default: focus time, descending, matching the
 * backend order the old list rendered.
 */

import {
  SortableDataTable,
  type DataColumn,
} from "@/components/arc/sortable-data-table/sortable-data-table";
import type { TaskSlice } from "@/lib/aggregations";

import { formatMinutes } from "./format";

export interface TopTaskRow extends Record<string, unknown> {
  task: string;
  minutes: number;
  sessions: number;
}

const COLUMNS: DataColumn<TopTaskRow>[] = [
  { key: "task", label: "Task", sortable: true },
  {
    key: "minutes",
    label: "Focus",
    sortable: true,
    numeric: true,
    render: (value) => formatMinutes(Number(value) * 60_000),
  },
  { key: "sessions", label: "Sessions", sortable: true, numeric: true },
];

export function TopTasksView({ slices }: { slices: TaskSlice[] }) {
  const rows: TopTaskRow[] = slices.map((slice) => ({
    task: slice.title,
    minutes: Math.round(slice.focusMs / 60_000),
    sessions: slice.sessions,
  }));

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Top tasks
      </p>
      <SortableDataTable
        rows={rows}
        columns={COLUMNS}
        rowKey={(row) => `${row.task}#${row.minutes}#${row.sessions}`}
        caption="Top tasks by focus time"
        emptyMessage="No tasks yet"
        defaultSort={{ key: "minutes", direction: "desc" }}
      />
    </div>
  );
}

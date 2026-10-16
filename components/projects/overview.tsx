"use client";

/**
 * The project overview panel — Task 14, PRD §4.1 "Per-project overview".
 *
 * Rendered by the task panel beneath the list whenever a project filter is
 * selected, so the filtered list above it *is* the overview's task list and
 * this card carries the derived numbers: open/done counts, estimated vs.
 * completed leaves, and focus time — all from `projects.overview`, all
 * derived at read time, stored nowhere (ADR-003).
 *
 * Two invariants shape the view:
 *
 *   - **Focus time is the snapshot's, not the name's.** The query filters
 *     sessions by `projectId`, so a rename cannot move history. The view
 *     proves nothing about that — the backend test does — but the card
 *     never renders a name beside a number it didn't arrive with.
 *   - **An empty project is calm, not zeroed.** A project with no tasks and
 *     no sessions renders one honest sentence rather than a grid of zeros
 *     pretending to be measurements — the same stance the stats surface
 *     takes for new users.
 *
 * A route (`app/projects/[id]/page.tsx`) was the alternative the task
 * offered. The panel won: the overview is a lens over the board the user is
 * already looking at, and a route would need navigation chrome the design
 * has no slot for. Deep-linking can revisit this when `/stats` lands.
 */

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Card } from "@heroui/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export interface OverviewData {
  project: { _id: string; name: string; archivedAt?: number };
  openCount: number;
  doneCount: number;
  estimatedLeaves: number;
  completedLeaves: number;
  /** Total focus time in minutes — focus phases only, breaks never count. */
  focusMinutes: number;
  focusSessions: number;
}

/**
 * The overview's markup, pure, so the formatting and the empty state are
 * testable without Convex. `data` is never `undefined`: the bound component
 * renders nothing while the query settles, so there is one empty case (a
 * project with nothing in it), not two.
 */
export function ProjectOverviewView({ data }: { data: OverviewData }) {
  const empty =
    data.openCount === 0 &&
    data.doneCount === 0 &&
    data.focusSessions === 0;

  return (
    <Card
      aria-label={`Overview of ${data.project.name}`}
      className="rounded-2xl border border-outline-variant/5 bg-surface-container-low/30 p-5"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-lg font-bold tracking-tight text-on-surface">
          {data.project.name}
        </p>
        {data.project.archivedAt !== undefined ? (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-on-surface-variant opacity-60">
            Archived
          </span>
        ) : null}
      </div>

      {empty ? (
        // Calm and specific: no grid of zeros pretending to measure a
        // project nothing has happened in yet (PRD §4.1, Task 14).
        <p className="text-sm text-on-surface-variant">
          Nothing here yet — file a task under this project and focus to see
          its numbers.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Tasks open / done
            </p>
            <p className="text-2xl font-bold tracking-tight text-on-surface">
              {data.openCount}
              <span className="ml-1 text-sm font-normal text-on-surface-variant">
                / {data.doneCount} done
              </span>
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Leaves done / est.
            </p>
            <p className="text-2xl font-bold tracking-tight text-on-surface">
              {data.completedLeaves}
              <span className="ml-1 text-sm font-normal text-on-surface-variant">
                / {data.estimatedLeaves}
              </span>
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Focus time
            </p>
            <p className="text-2xl font-bold tracking-tight text-on-surface">
              {(data.focusMinutes / 60).toFixed(1)}
              <span className="ml-1 text-sm font-normal text-on-surface-variant">
                hrs
              </span>
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Focus sessions
            </p>
            <p className="text-2xl font-bold tracking-tight text-on-surface">
              {data.focusSessions}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * The mounted overview. Gated exactly as every other owner-resolving query:
 * no session, no subscription. While it settles it renders nothing rather
 * than a zeros grid — zeros are a claim about the project, and the claim
 * cannot be made before the server answers.
 */
export function ProjectOverview({ projectId }: { projectId: Id<"projects"> }) {
  const { isAuthenticated } = useConvexAuth();
  const overview = useQuery(
    api.projects.overview,
    isAuthenticated ? { projectId } : "skip",
  );

  if (overview === undefined) {
    return null;
  }
  return (
    <div className="mt-4">
      <ProjectOverviewView data={overview} />
    </div>
  );
}

"use client";

/**
 * The live binding for "Today's Focus" — Task 10, extended in Task 11 with
 * selection, session binding and derived leaf counts.
 *
 * Everything Convex-shaped lives here and nowhere else: which query, which
 * mutations, what a `Doc<"tasks">` looks like once flattened for a row. The
 * panel is the seam that lets `task-list.tsx` be tested in jsdom with plain
 * fixtures while the acceptance criterion — *create/complete/reorder work
 * against live Convex queries* — is still proved for real, in the browser
 * pass against the running deployment.
 *
 * Two queries fill in what the buckets alone cannot, each scoped so it only
 * recomputes when its own inputs change:
 *
 *   - `leafCounts` — focus sessions per task, derived from the log and never
 *     stored (ADR-003). That is the row's `{n}/{estimate}`, and it may
 *     exceed the estimate because a finished task keeps receiving sessions
 *     (Task 11).
 *   - `activeTask` — PRD §4.1's `activeTaskId`, which draws the green rail.
 *     Clicking a row re-points it, and the same selection is handed to the
 *     timer below so a phase binds it at start (D8).
 *
 * One field still arrives stubbed: `projectName`, because there are no
 * projects until Task 13. The tag itself is built and tested today because
 * PRD §4.1 requires its position in the row and the design has no slot for
 * it (ADR-004).
 *
 * The whole panel is also gated on the anonymous session existing, because
 * `resolveOwner` — rightly — refuses a call with no identity behind it, and
 * a first-time visitor reaches the page several hundred milliseconds before
 * their identity does.
 */

import { useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";

import { api } from "@/convex/_generated/api";
import { useTimerStore, type ActiveTask } from "@/lib/store/timer";

import { TaskList, type TaskRow } from "./task-list";

/**
 * The four fields a row actually needs, in the shape the query returns them.
 *
 * Typed structurally so `Doc<"tasks">` flows in without a cast and a plain
 * object flows in from a test — which is the point of putting this function
 * here rather than inline in the component.
 */
export interface TaskFields<Id extends string = string> {
  _id: Id;
  title: string;
  estimate: number;
  activeFlag: boolean;
}

/**
 * Buckets from `list` → rows for the panel, in display order.
 *
 * Open rows first, then finished: `list` already returns them that way, and
 * restating it here means a change to the query's shape lands in one place.
 * The two facts a bucket cannot carry — which task is selected and how many
 * focus sessions each has — are matched in here so a row is derived in a
 * single pass and the list component never has to join anything itself.
 *
 * Both are deliberately optional: `isActive` false and `completedLeaves` 0
 * are exactly what the panel shows while the queries are still settling, so
 * the default is the honest "nothing yet" rather than a placeholder.
 */
export function toTaskRows<Id extends string>(
  buckets: {
    active: readonly TaskFields<Id>[];
    completed: readonly TaskFields<Id>[];
  },
  options: {
    /** The owner's selection; `null`/absent while settling or unselected. */
    activeTaskId?: Id | null;
    /** Focus-session counts keyed by task id; a missing key reads as `0`. */
    leaves?: Readonly<Record<string, number>>;
  } = {},
): TaskRow<Id>[] {
  const { activeTaskId = null, leaves = {} } = options;

  return [...buckets.active, ...buckets.completed].map((task) => ({
    id: task._id,
    title: task.title,
    estimate: task.estimate,
    done: !task.activeFlag,
    completedLeaves: leaves[String(task._id)] ?? 0,
    isActive: activeTaskId !== null && task._id === activeTaskId,
    projectName: null,
  }));
}

export function TaskPanel() {
  const { isAuthenticated } = useConvexAuth();

  // `useConvexAuth` deliberately comes from `@convex-dev/auth/react`, not
  // `convex/react`, even though `useQuery`/`useMutation` next door do. The
  // two hooks are not the same: `ConvexAuthProvider` keeps its own auth
  // context and flips it when the anonymous sign-in lands, while
  // `convex/react`'s hook reads the raw client's auth state — which that
  // provider never updates, so it reports `false` forever. Proven in the
  // browser: at t+5s the auth-package hook reads `true` and the
  // convex-react one still reads `false`. A single import would silently
  // pin this panel to "unauthenticated" for every visitor. Same trap
  // `convex-client-provider.tsx` documents at the top of this app.

  // Skipped, not merely *empty*, until there is an identity to resolve an
  // owner from: a query issued during the first anonymous round trip reaches
  // the server with no session and `resolveOwner` refuses it, which is the
  // correct answer to the wrong question. Convex's `"skip"` literal keeps
  // the subscription off until the session exists, and the returned
  // `undefined` below is exactly the "still settling" state either way.
  const rows = useQuery(api.tasks.list, isAuthenticated ? {} : "skip");

  // Same gate for the same reason: both derive an owner, so both would be
  // refused during the first anonymous round trip. Separate queries rather
  // than extra fields on `list` because they change for different reasons —
  // a click re-points one, a finished session rewrites the other — and one
  // combined query would recompute both for either.
  const activeTaskId = useQuery(
    api.tasks.activeTask,
    isAuthenticated ? {} : "skip",
  );
  const leaves = useQuery(api.tasks.leafCounts, isAuthenticated ? {} : "skip");

  const create = useMutation(api.tasks.create);
  const complete = useMutation(api.tasks.complete);
  const uncomplete = useMutation(api.tasks.uncomplete);
  const reorder = useMutation(api.tasks.reorder);
  const clearCompleted = useMutation(api.tasks.clearCompleted);
  const selectTask = useMutation(api.tasks.selectTask);

  // The timer cannot come and ask: it is a plain module with no client and
  // no env var (Task 6's seam), so the selection is pushed into it from here
  // — the one place holding both the id and the project the task is filed
  // under. From then on the store snapshots it when a phase begins, which is
  // what makes D8's "bound at start" possible without a network call.
  const setActiveTask = useTimerStore((s) => s.setActiveTask);

  useEffect(() => {
    // Only once both queries have settled: a transient `undefined` must not
    // briefly clear a selection that the next tick would restore.
    if (rows === undefined || activeTaskId === undefined) {
      return;
    }

    let selection: ActiveTask | null = null;
    if (activeTaskId !== null) {
      const task = [...rows.active, ...rows.completed].find(
        (candidate) => candidate._id === activeTaskId,
      );
      // The query returns `null` for a pointer whose target is gone, so this
      // only fails to find one if the list itself has not caught up.
      if (task !== undefined) {
        selection = { taskId: task._id, projectId: task.projectId };
      }
    }

    setActiveTask(selection);
  }, [rows, activeTaskId, setActiveTask]);

  function failed(what: string, error: unknown) {
    // A row the user believes exists but that never landed is worse than a
    // loud failure: the list is the only surface that shows it. Same stance
    // as the session logger in Task 8.
    console.error(`locked-in: could not ${what}`, error);
  }

  return (
    <TaskList
      // An empty list rather than nothing while the identity is settling, so
      // the column does not jump when the data lands. `activeTaskId` and
      // `leaves` may each still be `undefined`, which `toTaskRows` reads as
      // "nothing selected yet / no sessions yet" — the same honest default
      // the panel has always shown while a query settles.
      tasks={
        rows === undefined
          ? []
          : toTaskRows(rows, { activeTaskId, leaves })
      }
      // Nothing here is queued: a write issued before the session exists is
      // refused by the server, so the only honest options are "refuse the
      // read" (above) and "refuse the control" (below).
      ready={isAuthenticated}
      onCreate={(title, estimate) => {
        void create({ title, estimate }).catch((error) =>
          failed("create the task", error),
        );
      }}
      onToggle={(id, next) => {
        const call = next ? complete : uncomplete;
        void call({ taskId: id }).catch((error) =>
          failed("update the task", error),
        );
      }}
      onReorder={(taskId, afterId, beforeId) => {
        void reorder({ taskId, afterId, beforeId }).catch((error) =>
          failed("reorder the task", error),
        );
      }}
      onClearCompleted={() => {
        void clearCompleted({}).catch((error) =>
          failed("clear completed tasks", error),
        );
      }}
      onSelect={(id) => {
        // Clicking the row that is *already* selected clears it. PRD §4.1
        // defines clicking as selecting and says nothing about unselecting,
        // but a selection with no way back would attribute every future
        // session to whatever was last clicked, with the green rail as the
        // only sign it was still armed. Completed rows stay selectable, and
        // once selected they stay selected until another is chosen (Task 11).
        const next = id === activeTaskId ? null : id;
        void selectTask({ taskId: next }).catch((error) =>
          failed("change the active task", error),
        );
      }}
    />
  );
}

"use client";

/**
 * The live binding for "Today's Focus" — Task 10.
 *
 * Everything Convex-shaped lives here and nowhere else: which query, which
 * mutations, what a `Doc<"tasks">` looks like once flattened for a row. The
 * panel is the seam that lets `task-list.tsx` be tested in jsdom with plain
 * fixtures while the acceptance criterion — *create/complete/reorder work
 * against live Convex queries* — is still proved for real, in the browser
 * pass against the running deployment.
 *
 * Three fields arrive here already stubbed, each owned by a later task:
 *
 *   - `completedLeaves` — derived from the session log (ADR-003: never
 *     stored). It is `0` until Task 11 binds sessions to tasks, which is that
 *     task's own acceptance criterion.
 *   - `isActive` — PRD §4.2's *selected* task. Nothing selects before Task 11
 *     introduces `activeTaskId`, so drawing a marker now would invent a
 *     selection nobody made.
 *   - `projectName` — there are no projects until Task 13, so no row can
 *     name one yet. The tag itself is built and tested today because PRD
 *     §4.1 requires its position in the row and the design has no slot for
 *     it (ADR-004).
 *
 * The whole panel is also gated on the anonymous session existing, because
 * `resolveOwner` — rightly — refuses a call with no identity behind it, and
 * a first-time visitor reaches the page several hundred milliseconds before
 * their identity does.
 */

import { useMutation, useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";

import { api } from "@/convex/_generated/api";

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
 * The three stubbed fields are documented at the head of this file.
 */
export function toTaskRows<Id extends string>(buckets: {
  active: readonly TaskFields<Id>[];
  completed: readonly TaskFields<Id>[];
}): TaskRow<Id>[] {
  return [...buckets.active, ...buckets.completed].map((task) => ({
    id: task._id,
    title: task.title,
    estimate: task.estimate,
    done: !task.activeFlag,
    completedLeaves: 0,
    isActive: false,
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

  const create = useMutation(api.tasks.create);
  const complete = useMutation(api.tasks.complete);
  const uncomplete = useMutation(api.tasks.uncomplete);
  const reorder = useMutation(api.tasks.reorder);
  const clearCompleted = useMutation(api.tasks.clearCompleted);

  function failed(what: string, error: unknown) {
    // A row the user believes exists but that never landed is worse than a
    // loud failure: the list is the only surface that shows it. Same stance
    // as the session logger in Task 8.
    console.error(`locked-in: could not ${what}`, error);
  }

  return (
    <TaskList
      // An empty list rather than nothing while the identity is settling, so
      // the column does not jump when the data lands.
      tasks={rows === undefined ? [] : toTaskRows(rows)}
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
    />
  );
}

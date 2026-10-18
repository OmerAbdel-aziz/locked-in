"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef } from "react";

import { api } from "@/convex/_generated/api";
import type { TimerState } from "@/lib/pomodoro";
import { useTimerStore, type ActiveTask } from "@/lib/store/timer";

/**
 * Bridges the timer's in-flight boundaries to the server, and back — ADR-005.
 *
 * Two jobs, one component, for the same reason `SessionLogger` exists at
 * all: the store is a plain module that cannot touch a Convex client, and
 * a boundary a phase crosses on *any* route must find both a writer (for
 * the mirror) and a reader (for the next load) without a page remembering
 * to mount them.
 *
 * **Outbound** (`save`/`clear`): injected through `setTimerStatePersister`,
 * mirroring `setSessionLogger`. Fire-and-forget — §9 rules that the timer
 * never waits on a round-trip, so a failed mirror is reported and the
 * restored-on-refresh guarantee is simply downgraded to whatever
 * connectivity allowed, never the timer itself.
 *
 * **Inbound**: one `hydrate` on first load. Guarded by `hydratedRef` so a
 * reactive re-delivery of the same row cannot hydrate again after the user
 * has already acted (the store's own idle-guard is the second, stronger
 * half of that race). The row is converted to a `TimerState` here rather
 * than in the store so the store keeps receiving engine-shaped values and
 * the validator mapping lives with the code that knows the wire shape.
 *
 * A phase that ran out while the tab was closed hydrates as running with a
 * past `phaseEndsAt`; the existing tick → `completeIfDue` path then logs
 * the session at the instant it actually ended without any code here. That
 * is the whole point of persisting instants instead of remaining time.
 */
export function TimerStateSync() {
  const { isAuthenticated } = useConvexAuth();
  const row = useQuery(api.timer_state.get, isAuthenticated ? {} : "skip");
  const save = useMutation(api.timer_state.save);
  const clear = useMutation(api.timer_state.clear);

  // One restore per mount. The reactive query can re-deliver (reconnects,
  // re-renders of the same document); hydrating twice would overwrite state
  // the user has since built — not with a *wrong* row, but with a stale one.
  const hydratedRef = useRef(false);

  useEffect(() => {
    const { setTimerStatePersister } = useTimerStore.getState();
    setTimerStatePersister({
      save: (anchor) => {
        void save({
          phase: anchor.phase,
          cyclePosition: anchor.cyclePosition,
          status: anchor.status,
          phaseEndsAt: anchor.phaseEndsAt,
          startedAt: anchor.startedAt,
          pausedAt: anchor.pausedAt ?? undefined,
          boundTaskId: anchor.taskId,
          boundProjectId: anchor.projectId,
        }).catch((error) => {
          console.error("locked-in: timer boundary was not mirrored", error);
        });
      },
      clear: () => {
        void clear().catch((error) => {
          console.error("locked-in: timer mirror was not cleared", error);
        });
      },
    });

    return () => {
      // Unmounting must not leave a writer pointing at a mutation whose
      // provider is gone — same hygiene as `SessionLogger`.
      setTimerStatePersister(null);
    };
  }, [save, clear]);

  useEffect(() => {
    if (row === undefined || row === null) {
      // undefined = still loading; null = no in-flight phase to restore.
      return;
    }
    if (hydratedRef.current) {
      return;
    }
    hydratedRef.current = true;

    // Defensive on the exact fields the countdown math trusts: the row was
    // written by `save`'s validators, but this component outlives schema
    // generations, and a bad restore must fail safe to "untouched timer"
    // rather than produce NaN on the face.
    const plausible =
      Number.isFinite(row.startedAt) &&
      Number.isFinite(row.phaseEndsAt) &&
      row.startedAt < row.phaseEndsAt &&
      row.cyclePosition >= 1;
    if (!plausible) {
      return;
    }

    const state: TimerState = {
      phase: row.phase,
      cyclePosition: row.cyclePosition,
      status: row.status,
      phaseEndsAt: row.phaseEndsAt,
      pausedAt: row.pausedAt ?? null,
      startedAt: row.startedAt,
    };
    const boundTask: ActiveTask | null =
      row.boundTaskId === undefined
        ? null
        : { taskId: row.boundTaskId, projectId: row.boundProjectId };

    useTimerStore.getState().hydrate(state, boundTask);
  }, [row]);

  return null;
}

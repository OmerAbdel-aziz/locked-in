"use client";

/**
 * Merge-on-sign-in prompt — Task 24 (ADR-002 ask-first).
 *
 * Shown only when ALL hold: the viewer is a signed-in (non-anonymous) account,
 * a remembered pre-sign-in device owner differs from it, and
 * `merge.needsMerge` reports device rows. Otherwise renders nothing — in
 * particular anonymous-only users never see it during core flows (PRD §10.1).
 *
 * Device-owner memory: while anonymous, the viewer id is written to
 * localStorage (an external-system sync, so it lives in an effect); it is
 * READ via `useSyncExternalStore` (the same pattern as `useTzOffsetMinutes`
 * and `useCountdown` — Next 16 rejects client-render clock/storage reads
 * done any other way, and this also satisfies the no-setState-in-effect
 * rule). After the magic-link sign-in swaps the session to the account id,
 * the stored value names the device dataset.
 *
 * Default action = merge (`merge.execute`); the destructive path
 * (`merge.discardDeviceData`, Q10 hard-delete) requires an explicit
 * two-click confirm. Both re-point storage at the account id and bump a
 * local version so the prompt cannot reappear.
 */

import { useEffect, useSyncExternalStore, useState } from "react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { Button } from "@heroui/react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const STORAGE_KEY = "locked-in-device-owner";

function readStoredOwner(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private-mode storage: merging just won't trigger. Never crash chrome.
    return null;
  }
}

export function MergePrompt() {
  const { isLoading } = useConvexAuth();
  const viewer = useQuery(api.auth.viewer, isLoading ? "skip" : {});
  // Re-read storage whenever the viewer settles or a merge completes.
  const [version, setVersion] = useState(0);
  const storedOwner = useSyncExternalStore(
    () => () => {},
    () => (version >= 0 ? readStoredOwner() : null),
    () => null,
  );

  // External sync only: record the anonymous owner while anonymous.
  useEffect(() => {
    if (viewer !== undefined && viewer !== null && viewer.isAnonymous) {
      try {
        window.localStorage.setItem(STORAGE_KEY, viewer.id);
      } catch {
        // Same as the read path: storage failure must not break the flow.
      }
    }
  }, [viewer]);

  const deviceOwner: Id<"users"> | null =
    viewer !== undefined &&
    viewer !== null &&
    !viewer.isAnonymous &&
    storedOwner !== null &&
    storedOwner !== viewer.id
      ? (storedOwner as Id<"users">)
      : null;

  const needs = useQuery(
    api.merge.needsMerge,
    deviceOwner === null ? "skip" : { deviceOwnerId: deviceOwner },
  );
  const execute = useMutation(api.merge.execute);
  const discard = useMutation(api.merge.discardDeviceData);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (
    viewer === undefined ||
    viewer === null ||
    viewer.isAnonymous ||
    deviceOwner === null ||
    needs === undefined ||
    !needs.showPrompt
  ) {
    return null;
  }
  if (done !== null) {
    return (
      <div className="rounded-2xl bg-surface-container-low px-5 py-4 text-sm text-on-surface">
        {done}
      </div>
    );
  }

  const forgetDevice = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, viewer.id);
    } catch {
      // Same as above: storage failure must not break the flow.
    }
    setVersion((v) => v + 1);
  };

  return (
    <div
      role="dialog"
      aria-label="Merge device data"
      className="rounded-2xl bg-surface-container-low px-5 py-4"
    >
      <p className="text-sm font-bold text-on-surface">
        We found data on this device.
      </p>
      <p className="mt-1 text-sm text-on-surface-variant">
        Keep it and merge with your account, or use what&apos;s already in your
        account (device data is permanently deleted).
      </p>
      {!confirmingDiscard ? (
        <div className="mt-4 flex gap-3">
          <Button
            type="button"
            variant="primary"
            onPress={() =>
              void execute({ deviceOwnerId: deviceOwner }).then((r) => {
                forgetDevice();
                setDone(
                  `Merged: ${r.tasks} tasks, ${r.projects} projects, ${r.sessions} sessions. ${r.discarded} duplicates dropped.`,
                );
              })
            }
          >
            Merge (recommended)
          </Button>
          <Button type="button" variant="secondary" onPress={() => setConfirmingDiscard(true)}>
            Use account instead
          </Button>
        </div>
      ) : (
        <div className="mt-4 flex gap-3">
          <p className="text-sm text-tertiary">
            This permanently deletes the device data. Are you sure?
          </p>
          <Button type="button" variant="secondary" onPress={() => setConfirmingDiscard(false)}>
            Back
          </Button>
          <Button
            type="button"
            variant="danger"
            onPress={() =>
              void discard({ deviceOwnerId: deviceOwner }).then((r) => {
                forgetDevice();
                setDone(
                  `Device data deleted (${r.deleted} rows). Using your account.`,
                );
              })
            }
          >
            Delete device data
          </Button>
        </div>
      )}
    </div>
  );
}

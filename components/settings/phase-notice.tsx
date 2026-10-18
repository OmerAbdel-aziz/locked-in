"use client";

/**
 * The in-app phase-end signal — Task 17.
 *
 * A calm toast driven by the store's `phaseNotice`, which is recorded on
 * *every* completion: when the browser notification fired it is the same
 * fact in a second place, and when permission was denied (or the API is
 * missing) it is the signal the user still sees. It dismisses itself after
 * a few seconds and never blocks the timer — the transition already
 * happened before this rendered.
 *
 * No clock is read during render: `at` is data carried by the notice, and
 * the auto-dismiss timer lives in an effect.
 */

import { useEffect } from "react";
import { Button } from "@heroui/react";

import { phaseEndMessage } from "@/lib/notify";
import { useTimerStore } from "@/lib/store/timer";

/** How long the toast stays up before dismissing itself. */
export const NOTICE_VISIBLE_MS = 8000;

export function PhaseNotice() {
  const notice = useTimerStore((s) => s.phaseNotice);
  const dismissNotice = useTimerStore((s) => s.dismissNotice);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const id = setTimeout(dismissNotice, NOTICE_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [notice, dismissNotice]);

  if (notice === null) {
    return null;
  }

  const { title, body } = phaseEndMessage(notice.phase);

  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4"
    >
      <div className="glass-panel flex items-start justify-between gap-4 rounded-xl bg-surface-container-high px-5 py-4 font-mono shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]">
        <div>
          <p className="text-sm font-bold text-on-surface">{title}</p>
          <p className="mt-1 text-xs text-on-surface-variant">{body}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onPress={dismissNotice}
          aria-label="Dismiss notification"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

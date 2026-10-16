"use client";

/**
 * Focus Shroud — Task 18 (Phase 6).
 *
 * DESIGN.md §5: "A full-screen overlay component that dims all non-essential
 * UI (Task list, Nav, Stats) when the timer is running, leaving only the
 * Monospace timer and the current active task."
 *
 * The canonical two-column screen ships no shroud equivalent (ADR-004), so
 * the only concrete reference is the salvaged markup in
 * `docs/design/screens/focus-shroud-snippet.html`:
 *   fixed inset-0 bg-background/80 backdrop-blur-sm pointer-events-none opacity-0 z-40
 * That line is the base of the overlay below — same tokens, no invented
 * styling. Added around it is only what the task requires: the sanctuary
 * easing transition, the active opacity, and keyboard dismissal.
 *
 * How the "leaving only" part works: the overlay itself is `pointer-events-none`
 * (per the snippet, so it can never trap the timer), and the two surfaces that
 * stay live — the Timer Engine section and the active-task card wrapper — raise
 * themselves to `relative z-50` while the shroud is active (see `useShroudActive`
 * consumers in `timer-engine.tsx` / `progress-card.tsx`). Everything else
 * (header nav, task column, bento, footer) stays at its natural stacking level
 * and is visually dimmed beneath the `z-40` veil.
 *
 * Visibility rule (acceptance: active during running focus only, auto-dismiss
 * when the focus phase ends): `shouldShroudActive(phase, status, enabled)` —
 * pure, tested separately. The store's `shroudEnabled` toggle (default ON) is
 * the user's dismiss path; Escape also dismisses for keyboard users.
 */

import { useEffect } from "react";

import type { Phase, TimerStatus } from "@/lib/pomodoro";
import { useTimerStore } from "@/lib/store/timer";

/** Base classes verbatim from the salvaged snippet, plus the design's easing. */
export const SHROUD_BASE_CLASS =
  "fixed inset-0 bg-background/80 backdrop-blur-sm pointer-events-none z-40 transition-opacity duration-500 ease-sanctuary";

export function shouldShroudActive(
  phase: Phase,
  status: TimerStatus,
  shroudEnabled: boolean,
): boolean {
  return shroudEnabled && phase === "focus" && status === "running";
}

/** Reads the store; the single place the visibility rule is evaluated live. */
export function useShroudActive(): boolean {
  const phase = useTimerStore((s) => s.state.phase);
  const status = useTimerStore((s) => s.state.status);
  const shroudEnabled = useTimerStore((s) => s.shroudEnabled);
  return shouldShroudActive(phase, status, shroudEnabled);
}

export function FocusShroud() {
  const active = useShroudActive();
  const setShroudEnabled = useTimerStore((s) => s.setShroudEnabled);

  // Keyboard dismissal: Escape hides the veil for this run without pausing
  // the timer. It flips the same toggle the button flips, so the two paths
  // cannot disagree about what "dismissed" means.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShroudEnabled(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, setShroudEnabled]);

  return (
    <div
      data-testid="focus-shroud"
      data-active={active ? "true" : "false"}
      aria-hidden="true"
      className={`${SHROUD_BASE_CLASS} ${active ? "opacity-100" : "opacity-0"}`}
    />
  );
}

/**
 * The toggle control — rendered beside the timer (see `app/page.tsx`), always
 * keyboard-focusable as a native button with `aria-pressed`. Turning it off
 * while a focus session runs hides the veil immediately; turning it on during
 * a run shows it. It never touches the timer itself.
 */
export function ShroudToggle() {
  const shroudEnabled = useTimerStore((s) => s.shroudEnabled);
  const setShroudEnabled = useTimerStore((s) => s.setShroudEnabled);
  const phase = useTimerStore((s) => s.state.phase);
  const status = useTimerStore((s) => s.state.status);

  const active = shouldShroudActive(phase, status, shroudEnabled);

  return (
    <button
      type="button"
      aria-pressed={shroudEnabled}
      aria-label={shroudEnabled ? "Hide focus shroud" : "Show focus shroud"}
      title={shroudEnabled ? "Hide focus shroud" : "Show focus shroud"}
      onClick={() => setShroudEnabled(!shroudEnabled)}
      data-testid="shroud-toggle"
      data-active={active ? "true" : "false"}
      className="mt-4 rounded-full bg-surface-container-low px-3 py-1 text-xs font-semibold text-on-surface-variant transition-colors duration-150 ease-sanctuary hover:bg-surface-container-high hover:text-on-surface"
    >
      {shroudEnabled ? "Shroud on" : "Shroud off"}
    </button>
  );
}

/**
 * The left-column wrapper — Task 18 fix (2026-10-16).
 *
 * The veil sits at root-level `z-40`, but the column carries the `.enter`
 * entrance animation whose `both` fill mode retains `translateY(0)` forever —
 * a permanent stacking context that traps any `z-index` set *inside* the
 * column (the engine section / card wrapper `z-50` from the first pass never
 * escaped it, so the timer rendered dimmed under its own veil). The elevation
 * therefore belongs here, on the column itself: `main` and the page root are
 * unpositioned and create no stacking contexts, so this one positioned
 * ancestor compares against the veil at the root level and wins. The column
 * holds exactly the stay-visible surfaces (engine, active-task card, toggle);
 * header nav, task column, bento and footer keep their natural level and dim.
 */
export function ShroudColumn({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const active = useShroudActive();
  return (
    <div
      data-testid="shroud-column"
      data-shroud-elevated={active ? "true" : "false"}
      className={`${className} ${active ? "relative z-50" : ""}`}
    >
      {children}
    </div>
  );
}

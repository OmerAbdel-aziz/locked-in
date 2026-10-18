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
import { Button } from "@heroui/react";

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
    <Button
      size="sm"
      variant="secondary"
      aria-pressed={shroudEnabled}
      aria-label={shroudEnabled ? "Hide focus shroud" : "Show focus shroud"}
      onPress={() => setShroudEnabled(!shroudEnabled)}
      data-testid="shroud-toggle"
      data-active={active ? "true" : "false"}
      className="mt-4"
    >
      {shroudEnabled ? "Shroud on" : "Shroud off"}
    </Button>
  );
}

/**
 * The left-column wrapper — Task 18 fix (2026-10-16), Phase 9 polish.
 *
 * The veil sits at root-level `z-40`, but the column carries the `.enter`
 * entrance animation whose `both` fill mode retains `translateY(0)` forever —
 * a permanent stacking context that traps any `z-index` set *inside* the
 * column (the engine section / card wrapper `z-50` from the first pass never
 * escaped it, so the timer rendered dimmed under its own veil). The elevation
 * therefore belongs here, on the column itself: `main` and the page root are
 * unpositioned and create no stacking contexts, so this one positioned
 * ancestor compares against the veil at the root level and wins. The column
 * holds exactly the stay-visible surfaces (mode tabs, engine, active-task
 * card, toggle); header nav, task column, bento and footer keep their natural
 * level and dim.
 *
 * Phase 9: while the shroud is up the column also takes the full grid width,
 * so the timer sits centered on the screen instead of parked in its
 * dashboard lane — same `shroudActive` flag as the elevation, so toggling
 * the shroud off mid-run snaps back to the 7/5 composition with no new
 * state. The structural classes live here (not in the page's `className`,
 * which carries only extras like `enter`) so the two spans can never be
 * passed together and fight over the cascade.
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
      className={`col-span-12 flex min-w-0 flex-col items-center justify-center ${
        active ? "relative z-50 lg:col-span-12" : "lg:col-span-7"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * The task column's shroud counterpart — Phase 9 polish.
 *
 * Grill ruling: under the shroud the right column unmounts rather than
 * merely dimming. The veil is `pointer-events-none`, so dimmed controls
 * would stay clickable beneath it — a ghost dashboard catching stray
 * clicks — and an empty dimmed lane next to a centered timer is dead
 * space. Unmounting also drops its Convex subscriptions for the run;
 * they resubscribe when the phase ends. Header and footer stay mounted
 * and dimmed (Escape and the toggle's keyboard path live outside this).
 */
export function ShroudHidden({ children }: { children: React.ReactNode }) {
  const active = useShroudActive();
  if (active) return null;
  return <>{children}</>;
}

/**
 * Focus / Short Break / Long Break selector — Task 7, rewritten onto
 * HeroUI in Phase 3.5c, relocated above the ring in the Phase 9 polish.
 *
 * These look like navigation but behave as a mode switch: selecting one
 * repositions the engine through `setPhase` — it is neither a completion
 * nor a skip, so it never advances the cycle. It lives with the timer it
 * drives (centered above the ring) rather than in the header.
 *
 * HeroUI mapping (PRD D6a): Tabs, secondary variant — its underline
 * indicator is the active underline the design itself draws. That affordance
 * is a control state, not a section divider, so it does not touch DESIGN.md's
 * no-line rule. Grill ruling (Phase 9): the underline stays — the Focus/Stats
 * pill is a *route* switcher, this is a *state* switch, and the two jobs stay
 * visually distinct.
 *
 * Disabled while the timer runs: `selectPhase` abandons whatever is running
 * with no session logged (lib/pomodoro.ts), so a tap mid-run — now directly
 * above the digits being stared at — would silently kill the session. Pause
 * or wait for idle to switch modes.
 */

"use client";

import { Tabs } from "@heroui/react";

import { PHASES, type Phase } from "@/lib/pomodoro";
import { useTimerStore } from "@/lib/store/timer";

const PHASE_LABEL: Record<Phase, string> = {
  focus: "Focus",
  short: "Short Break",
  long: "Long Break",
};

export function ModeTabs() {
  const phase = useTimerStore((s) => s.state.phase);
  const status = useTimerStore((s) => s.state.status);
  const setPhase = useTimerStore((s) => s.setPhase);

  return (
    <div className="mb-6 flex w-full justify-center">
      <Tabs
        variant="secondary"
        selectedKey={phase}
        isDisabled={status === "running"}
        onSelectionChange={(key) => setPhase(key as Phase)}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Timer mode">
            {PHASES.map((candidate) => (
              // HeroUI's default tab is h-8 px-4 text-sm, which at these
              // longer labels ("Short Break", "Long Break") sits so low it
              // collides with the secondary variant's underline indicator
              // when selected (Phase 9 polish). Compact: smaller type and
              // tighter padding so the label clears the active line.
              <Tabs.Tab
                key={candidate}
                id={candidate}
                className="h-7 px-2.5 text-xs"
              >
                {PHASE_LABEL[candidate]}
                <Tabs.Indicator />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
    </div>
  );
}

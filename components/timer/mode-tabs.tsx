/**
 * Focus / Short Break / Long Break selector — Task 7, rewritten onto
 * HeroUI in Phase 3.5c.
 *
 * These look like navigation but behave as a mode switch: selecting one
 * repositions the engine through `setPhase` — it is neither a completion
 * nor a skip, so it never advances the cycle.
 *
 * HeroUI mapping (PRD D6a): Tabs, secondary variant — its underline
 * indicator is the active underline the design itself draws. That affordance
 * is a control state, not a section divider, so it does not touch DESIGN.md's
 * no-line rule.
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
  const setPhase = useTimerStore((s) => s.setPhase);

  return (
    <div className="flex h-full items-center">
      <Tabs
        variant="secondary"
        selectedKey={phase}
        onSelectionChange={(key) => setPhase(key as Phase)}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Timer mode">
            {PHASES.map((candidate) => (
              <Tabs.Tab key={candidate} id={candidate}>
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

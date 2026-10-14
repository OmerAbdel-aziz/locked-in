# ADR-004: Two-column dashboard is the canonical layout

**Status:** Accepted
**Date:** 2026-10-14
**Decider:** Human (owner)
**Supersedes:** the single-column composition previously frozen in `docs/design/`

## Context

The Stitch project (`14098409106330604275`, "Locked In Dashboard UI") contains four
screens across **two different compositions**, not four states of one layout:

- **Single column** — *Running (Desktop)*, exported twice at 1280×1024 and 2560×2722
  (byte-identical HTML). Timer ring → controls → active-task card → task list → footer,
  stacked vertically.
- **Two column** — *Paused (Desktop)*, 2560×2048. A "Timer Engine" column beside an
  "Editorial Bento" task panel with a Summary block, over a status footer.
- *Running (Mobile)*, 780×2542 — a third, mobile-specific composition.

The PRD (§1) specified "a single-screen web app", and its §4.1 footer aggregate,
`Total today: N estimated • M completed`, matched the single-column composition. The
two-column design additionally displayed metrics the PRD had not asked for on the home
screen (`Today's Output 4.2 hrs`, `Focus Score 92%`), and PRD §4.1 explicitly stated the
goal is "a **readout only** — no celebration gate, no reward state in MVP", while §4.1
trends are "insight without judgment". A "Focus Score" percentage reads as a judgment
metric, so adopting the two-column design appeared to contradict the PRD.

This was flagged in `docs/design/README.md` and `tasks/plan.md` as an open item blocking
Task 7.

## Decision

**The two-column dashboard is canonical.** Rationale given by the decider: better UX.

The single-column composition is discarded from `docs/design/`. Its one unique asset —
the Focus Shroud overlay markup, the only concrete shroud reference in the package — was
salvaged to `docs/design/screens/focus-shroud-snippet.html` before removal, since Task 18
has no other source for it.

## Consequences

### The PRD's requirements survive; its *composition* description does not.

Where the design and PRD diverge, the PRD's functional requirements are preserved and
expressed inside the two-column composition:

1. **`Today's Output`** replaces the single-column footer's `Total today:` aggregate.
   Same data (today's estimated vs. completed focus work), relocated into the Summary
   bento. PRD §4.1's footer requirement is satisfied here rather than in a footer strip.

2. **`Focus Score`** is defined as the **completion ratio** — completed leaves ÷
   estimated leaves — which PRD §4.1 *already mandates* on `/stats` ("Completion ratio
   (completed leaves vs. estimated leaves) over the range"). Surfacing it on the home
   screen is additive, not new scope. It stays a **passive readout**: no gate, no
   celebration, no threshold state, no color-coded pass/fail. This preserves §4.1's
   "no reward state" and §4.1's "insight without judgment".

3. **Project tags** are required by PRD §4.1 (optional assignment, picker, list filter)
   but the design's task rows show none. The design is silent, not contradictory — render
   the tag inline in the task row.

4. **`Clear completed`** is required by PRD §4.1 as a bulk action but absent from the
   design. Place it beneath the task list.

5. **Footer `PWA INSTALLED`** is decorative chrome. PRD assumption 1 puts PWA out of
   scope; assumption 4 requires *real* local time and *real* connection status. Task 26
   replaces the placeholder.

6. **Focus Shroud** (PRD §4.1) has no equivalent in the two-column screen. It remains in
   scope, implemented from `screens/focus-shroud-snippet.html` + DESIGN.md §5.

### Open, deliberately deferred

- The two-column screen is captured in its **paused** state (`25:00`, "Start Focus
  Session"). There is no two-column *running* state in the Stitch project — no screenshot
  of the active ring, the Pause CTA, or the running controls. Task 7 must derive the
  running state from the paused screen plus DESIGN.md's progress-ring rules. If a
  running-state two-column screen is wanted for fidelity, generate it on Stitch and
  re-export; this ADR does not block on it.
- The discarded single-column HTML remains recoverable from git history (`50e72e2`).

## Notes

The token set is unaffected: all four screens carried an identical 47-color set matching
the project's `designTheme.namedColors` exactly. Task 2's port source is valid unchanged.

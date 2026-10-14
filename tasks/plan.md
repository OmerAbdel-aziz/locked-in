# Implementation Plan: Locked In

## Overview

Build "Locked In" per `docs/prd.md`: a Next.js (App Router) + Convex focus/pomodoro app with anonymous-first auth, tasks & projects, session log as canonical data, derived streak & stats, Focus Shroud, settings, merge-on-sign-in, and CSV session import/export. Frontend on Vercel, backend on Convex. Vertical slices; every phase leaves a working app.

## Architecture Decisions

See `docs/decisions/` for full ADRs. Summary:
- **ADR-001:** Next.js + Tailwind + shadcn/ui + Zustand; Convex backend; Vercel frontend.
- **ADR-002:** Anonymous-first; magic link optional; ask-on-sign-in with merge default; CSV import feeds the merge path.
- **ADR-003:** Sessions are an append-only log; streak, leaf counts, daily totals, and all stats are derived at read time; `taskId`/`projectId` bound at session start (immutable); day = calendar date at recorded `tzOffsetAtCompletion`.

Plan-specific conventions:
- **Pure logic lives in `lib/`** (pomodoro engine, streak, aggregations, CSV, merge) — framework-free, unit-tested first. Convex functions and React components are thin shells over it.
- **Timer is client-only** (Zustand, timestamp-anchored). Network is never consulted for ticking.
- **Owner resolution:** every Convex query/mutation resolves owner through the `identities` link (anonymous id or linked user) — one helper, used everywhere.
- **Online-only:** no offline buffering anywhere (PRD D9).

## Dependency Graph

```
Scaffold + design tokens
    │
Convex schema + anonymous identity
    │
    ├── Pomodoro engine (pure) ──► timer store ──► timer UI ──► session write
    │                                                       │
    ├── Tasks CRUD ──► task list UI ──► active task binding ◄┘
    │        │               │
    │        └── aggregates (summary bento, progress card)
    │
    ├── Projects CRUD ──► picker/filter ──► project overview
    │
    ├── Streak derivation (reads sessions) ──► badge
    ├── Settings (feeds timer behavior) ──► notifications
    ├── Shroud (timer state dependent)
    ├── Stats aggregations ──► /stats page ──► trends, time-of-day, history
    │
    └── Auth (magic link) ──► merge flow ──► CSV import/export
                                                 │
                              Design review + E2E + deploy
```

## Task List

### Phase 1: Foundation
- Task 1: Scaffold app + repo hygiene
- Task 2: Port DESIGN.md tokens into Tailwind + base typography/fonts
- Task 3: Convex init + schema v1 with indexes
- Task 4: Anonymous identity + owner-resolution helper

**Checkpoint A:** app builds, `/` renders a styled shell, `npx convex dev` serves schema, identity helper unit-tested.

### Phase 2: Timer core
- Task 5: Pomodoro engine (pure logic) + unit tests
- Task 6: Timer Zustand store (timestamp-anchored)
- Task 7: Timer UI (ring, digits, controls, mode tabs)
- Task 8: Session completion → session log write + cycle progress readout

**Checkpoint B:** backgrounding the tab doesn't drift the timer; completing a focus session creates a session row and advances "Session N of M".

### Phase 3: Tasks vertical
- Task 9: Task CRUD Convex functions + ordering
- Task 10: Task list UI (add, checkbox, drag reorder, leaves, project tag, active selection)
- Task 11: Active-task ↔ session binding (leaf increments)
- Task 12: Active-task progress card + Today's Output / Focus Score summary bento

**Checkpoint C:** full loop works — add task → set active → run session → leaves/progress update live. *Human review.*

### Phase 4: Projects vertical
- Task 13: Project CRUD + picker/filter on tasks
- Task 14: Project overview panel

**Checkpoint D:** create project → assign tasks → overview shows derived focus time.

### Phase 5: Streak + Settings
- Task 15: Streak derivation + timezone-edge tests + header badge
- Task 16: Settings dialog (durations, N, auto-start, notifications flag) wired to timer
- Task 17: Browser notifications on phase end

**Checkpoint E:** streak survives tz-edge fixtures; changing durations in Settings affects the next phase.

### Phase 6: Focus Shroud
- Task 18: Focus Shroud overlay + toggle

### Phase 7: Stats surface
- Task 19: Aggregation functions (ranges, per-day, per-project, top tasks, completion ratio)
- Task 20: `/stats` page — range selector + charts (hand-rolled SVG)
- Task 21: Trends + time-of-day panels
- Task 22: Session history list + empty states

**Checkpoint F:** 30-day fixture matches hand-computed oracle (PRD §10.8). *Human review.*

### Phase 8: Identity, merge, CSV
- Task 23: Magic-link sign-in (Convex Auth)
- Task 24: Merge-on-sign-in prompt + merge logic (incl. project dedupe/remap)
- Task 25: CSV export + import (same schema, feeds merge path)

**Checkpoint G:** golden-fixture merge tests pass; CSV round-trip lossless.

### Phase 9: Polish & launch
- Task 26: Design review pass vs DESIGN.md checklist (chrome: real clock, connection status)
- Task 27: Playwright E2E (first-run loop, merge flow, stats attribution)
- Task 28: Deploy (Convex + Vercel), verify hosting tiers, README

**Checkpoint H (ship):** PRD success criteria §10 all green; `npm run build` + `npm test` green on main.

## Parallelization

- **Parallel-safe after their foundations:** Phase 4 (projects) vs. Phase 5 (streak/settings); Phase 7 (stats) vs. Phase 8 (auth/merge) — different files, shared schema read-only.
- **Sequential:** schema changes (Task 3 onward, one at a time); session-write contract shared by Tasks 8/11 — land Task 8 first.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Merge semantics wrong → data loss | High | ADR-003 makes sessions canonical; golden fixtures before UI (Task 24 acceptance) |
| Timer drift / wrong cycle rules | High | Pure engine + tests first (Task 5); drift encoded in unit tests |
| Stats queries slow / client-scan logs | Med | Range-bounded indexes on `completedAt` defined in Task 3, verified in Task 19 |
| Design drift from Stitch package | Med | Tokens ported once (Task 2); checklist gate in Task 26 |
| Two-column layout has no running-state screen and no Focus Shroud | Med | Canonical `docs/design/code.html` is captured paused; Task 7 derives the running state from DESIGN.md §5. Focus Shroud markup salvaged to `docs/design/screens/focus-shroud-snippet.html` for Task 18. ADR-004. |
| Hosting free-tier surprise | Low | Task 28 verifies before launch; nothing blocks earlier phases |

## Open Questions

- Drag-reorder ordering scheme (fractional index vs. ranks) — decide in Task 9 (lean: fractional).
- Charting approach — lean hand-rolled SVG (PRD §11.5); confirm at Task 20.
- Convex vs. Vercel frontend hosting — verify at Task 28.

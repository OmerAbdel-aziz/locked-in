# ADR-005: In-flight timer state is mirrored to Convex for refresh recovery

## Status
Accepted

## Date
2026-10-18

## Context
The countdown is always derived from a wall-clock instant (`phaseEndsAt - now`),
never a decrementing counter — so tab-backgrounding and device sleep are
survived with zero writes. But the live state (`phaseEndsAt`, `startedAt`,
`pausedAt`, `status`, cycle position, D8 binding) lives only in the client
Zustand store. A **refresh** rebuilds the store from `initialTimerState()`,
and a phase that never completed leaves no evidence anywhere: only completed
sessions are persisted (ADR-003), so an in-flight session was silently lost —
this contradicted the PRD's own success criterion "timer state is accurate
after tab-backgrounding, **refresh**, and device sleep".

Convex's reactive subscription cannot help: realtime can only mirror data
that exists as documents, and nothing existed server-side for an in-flight
phase. D9 ("online-only, timer is client state") and the §9 "never persist
timer ticks" rule were written before the refresh case was measured against
them.

## Decision
**Mirror the in-flight timer server-side** in a new `timerState` table —
one row per owner, **rewritten on boundary events only** (start, pause,
resume, skip, reset, completion, and any transition that moves the deadline
or cycle position), **deleted** whenever the timer goes idle.

- The row stores **instants, never remaining time**: `phaseEndsAt`,
  `startedAt`, `pausedAt`, plus `phase`, `cyclePosition`, `status`, and the
  D8 binding (`boundTaskId` / `boundProjectId`, snapshotted at phase start).
- On load, a reactive `timerState.get` query hands the row to a single
  store-level `hydrate()` action, which restores `state` + `boundTask`
  wholesale — guarded to idle, so a user who beat the query with Start wins.
- Restoring stays **pure wall-clock math**: nothing recomputes remaining
  time from data, because the countdown already derives it per tick from
  `phaseEndsAt - now`.
- Writes are boundary events (`write session boundaries only`, PRD §9 as
  written); no tick ever touches the network.

## Restore semantics (decided behaviour)
- **Mid-phase refresh** → the face resumes running at the correct remaining
  time; **paused refresh** → frozen at the paused remaining (`pausedAt`).
- **Refresh after the phase would have ended** (tab closed past
  `phaseEndsAt`) → restores as "exactly as if nothing happened": the phase
  reads due, the next tick's `completeIfDue` completes it, the session row
  is written with `completedAt = min(phaseEndsAt, now) = phaseEndsAt`, and
  auto-start (per settings) begins the next phase anchored at restore time.
  Counts, streak, and today's summary are therefore correct as if the tab
  had stayed open, with one honest limit: only the *current* phase accrues
  while away — an auto-started *next* phase begins at the reload instant,
  not extrapolated backwards. Chaining deadline reconstruction was
  considered and rejected: it can cascade arbitrarily for long absences.
- **Two tabs on one account** → `logCompleted`'s existing
  `(ownerId, completedAt)` idempotency already coalesces their completions
  into exactly one session row; the mirror row itself is
  last-boundary-writer-wins.
- **Offline refresh** → still lost (D9 stays online-only; no outbox was
  added). Offline use degrades the recovery guarantee, not the timer.

## Alternatives considered
- **`zustand/persist` to localStorage**: refresh-proof but single-device,
  contradicts D9's "no local persistence layer", adds a stale-state repair
  problem, and rehydrates even when a session completed on another device.
  Rejected.
- **Server-reconstructed countdown chains** (extrapolate auto-started
  phases back through the absence): correct in spirit but unbounded for
  long absences, and it invents time the user may not want recorded.
  Rejected (documented limit above).
- **Do nothing**: keep refresh out of scope and document it. Rejected —
  the PRD's success criterion already promised refresh accuracy; the
  implementation, not the PRD, was the gap.

## Consequences
- A `timerState` table with exactly one row per active timer: negligible
  storage, and idle users have no row at all.
- The engine (`lib/pomodoro.ts`) and all existing transition rules are
  untouched; the mirror rides the store's single `transition` choke point,
  and `hydrate` bypasses it deliberately (no echo loop).
- D9 in the PRD is revised (2026-10-18): "timer is client state" still
  holds for *computations*; its boundary instants are mirrored. The §9
  "never persist timer ticks" rule is unchanged — these are boundaries.
- A failed mirror write (connectivity) is reported and downgrades only
  refresh recovery; the timer never waits on the network (§9).
- `save` validates client timestamps plausibility the same way
  `logCompleted` does; ownership of the bound task/project is re-proved
  server-side through the same `lib/owner.ts` helpers.

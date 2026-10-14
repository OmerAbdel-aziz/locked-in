# ADR-003: Session log as canonical data; streak and counts are derived

## Status
Accepted

## Date
2026-10-14

## Context
The streak badge ("Streak: 5"), per-task leaf counts ("4 Pomodoros Focused / Goal: 8"), and daily footer ("8 estimated • 3 completed") all need a source of truth. Two devices on one account can diverge; merge-on-sign-in (ADR-002) and CSV import both inject history after the fact. A mutable stored counter cannot survive either.

## Decision
**Sessions are an append-only log** (`{ownerId, startedAt, completedAt, phase, taskId?, tzOffsetAtCompletion}`), written once when a phase completes. Every displayed aggregate — streak, task leaf counts, session progress, daily totals — is **computed from the log at read time** (or cached via Convex reactive query derivations, never persisted as authoritative).

- **Day grouping:** calendar date at the session's recorded `tzOffsetAtCompletion`. A session completing at 00:01 local counts for the new day; 23:59 counts for the old one.
- **Streak rule (D5):** ≥1 completed focus session earns the day; a missed local calendar day breaks it; no grace period.
- **Task binding:** `taskId` is written at session **start** (active task) and is immutable afterward (D8).

## Alternatives Considered

### Stored mutable counters (`streakCount`, `completedPomodoros`)
- Pros: Trivial reads, no aggregation.
- Cons: Merge can't recompute honestly from two counters; import would have to guess; a single bug permanently corrupts state; timezone corrections impossible.
- Rejected.

### Session log with start-time day attribution
- Cons: A session started at 23:50 and finished at 00:05 would be credited to the day the user didn't finish it — misaligns with "completion earns the streak."
- Rejected: completion time is the moment of effort.

### Store both log and counters
- Pros: Fast reads.
- Cons: Two truths to keep in sync; drift risk.
- Deferred: materialized/cached aggregates are acceptable as a *performance* layer, but the log remains authoritative.

## Consequences
- Storage grows linearly (~a few KB/user/year) — negligible.
- All aggregation logic lives in `lib/` and is unit-tested, including DST/timezone edges (PRD §10.3).
- CSV import/export is trivially lossless: same shape as the log (PRD §10.5).
- Deleting an account = deleting its session log; nothing else references authoritative counts.

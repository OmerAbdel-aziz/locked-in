# 01: Migration guardrails — golden fixtures + schema expand

**What to build:** The safety net before anything moves. A pre-migration fixture dataset (old-schema-shaped: projects, tasks, sessions, settings — as PRD v1 left them) plus a golden test asserting that every user-facing aggregate (session count, focus minutes, streak, progress card, today summary) derives identically through the same queries users see. Then the *expand* half of the schema change: new forms added beside the old with null-safe defaults — a Milestones table, milestone linkage on units, roadmap Plan fields, Career Ladder fields — so nothing existing reads differently and the app behaves byte-for-byte as it does today.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Fixture dataset reproduces PRD-v1-shaped data and exercises merge/CSV seams too (they carry forward).
- [ ] Golden test proves identical aggregates read *before* and *after* the expand, through user-facing queries only.
- [ ] Expanded schema passes all existing suites, including design-rule gates and typecheck/lint.

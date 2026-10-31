# 02: Roadmap spine — Milestones and Units on the home panel

**What to build:** The learning spine, end to end and demoable: the home panel groups Units under Milestones; the learner creates/renames/archives Milestones, adds Units (with optional time estimate and per-unit "already known"), drag-reorders both levels with the existing fractional-ordering machinery, and checks a unit — Roadmap and Milestone headers live-update percent complete in freerobotics-style ("12/54"). Builder does *not* yet do careers, imports, or pace: structure first.

**Blocked by:** 01 — Migration guardrails.

**Status:** ready-for-agent

- [ ] The vertical path works: create roadmap → milestone → units → reorder → complete / mark-known, all visible on the home panel.
- [ ] Percent complete derives at roadmap and milestone level from unit state (known affects "percent known", not "percent complete").
- [ ] Order-exhaustion on reordering behaves exactly like today's task ordering (throws, never silently corrupts).
- [ ] New vitest/convex-test suites drive it through the app's function seams, plus a Playwright happy path.

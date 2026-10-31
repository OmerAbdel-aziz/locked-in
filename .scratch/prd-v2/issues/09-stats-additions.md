# 09: Stats additions — roadmap dimension (keep + add)

**What to build:** The keep-and-add slice: every existing stats screen is preserved untouched-in-behaviour, and the additions land: per-Roadmap focus-hours split alongside the existing charts (the "where did my focus go" answer), while the existing range selector, heatmap, top-of-table, time-of-day trends and session history keep working identically. There must be no new screens — additions only, on the surface learners already use.

**Blocked by:** 08 — Plan + Pace panel (so chart vocabulary matches pace words and the roadmap dimension ships once, consistently).

**Status:** ready-for-agent

- [ ] All existing chart suites/visual regression still green untouched (regression-green is the acceptance, not a rewrite).
- [ ] Per-roadmap hours split derived from the Session log at read time; empty roadmaps render as honest zero, not hidden.
- [ ] Stalled/all-risk wording visible on the roadmap dimension matches the pace module's vocabulary 1:1.
- [ ] No new data sources, no new seams — the additions reuse today's stats queries' shape.

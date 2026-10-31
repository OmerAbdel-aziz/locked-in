# 08: Plan + Pace panel

**What to build:** The "am I on pace?" answer, end to end: a learner sets one weekly focus-hour target per Roadmap; the roadmap header shows a **Pace panel** reconciling logged (bound) hours in the current week against the plan — plan vs actual, and a status word: *on track / at risk / stalled* (stalled = no bound session for ~2 weeks). Pace band logic lives as a pure module, equivalence-tested like the pomodoro engine and streak math — arithmetic over the existing timezone-aware day grouping of the Session log (ADR-003 discipline: derived, never stored).

**Blocked by:** 02 — Roadmap spine.

**Status:** ready-for-agent

- [ ] Pure pace module is equivalence-tested: exact threshold bands, week rollovers, timezone-grouped hours, zero-session roadmaps, "stalled then resumed".
- [ ] Setting/editing the Plan is one number, one field, one mutation — no calendar/deadline concepts leak in (Q11).
- [ ] Pace panel renders plan vs actual for the current week per roadmap, status word updating live after each bound session.
- [ ] Unbound hours never confuse pace (only bound effort counts toward the plan, matching Q2/Q16).

# 03: Timer spine — sessions bind to Units, unbound stays legal

**What to build:** The pomodoro ritual picks up the spine: selecting a Unit from the roadmap panel binds it to the timer exactly like the old active-task binding (active-flag + order hot path included), and every session — bound or unbound — logs to the append-only Session log identically with its binding snapshot. Bare timers are permitted and simply never distinguish themselves in stats. This is the "unchanged engine, new attachment point" slice.

**Blocked by:** 02 — Roadmap spine.

**Status:** ready-for-agent

- [ ] Binding a unit reproduces today's binding behaviour in every observable way (active-task marker, bound session's unit/project snapshot at start, in-flight mirror carries unit id across refresh/mirror recovery).
- [ ] Unbound sessions log with no shipment and no nudge path; stats remain undifferentiated by design (Q2).
- [ ] All timer equivalence tests keep passing untouched; new tests cover the unit-bound path and its project semantics.

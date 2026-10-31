# 07: roadmap.sh import

**What to build:** Paste a public roadmap.sh URL → get a living editable Roadmap: fetch (server-side, no auth), a fixture-driven pure parse mapping groups → Milestones and nodes → Units, roadmap.sh's natural order and skipped/optional markings preserved, then one transactional plan-and-write (no half-roadmaps ever). After import, the roadmap is fully editable everywhere — same as hand-built — and the import surface fails loudly and safely (nothing written on a parse failure, nothing corrupted).

**Blocked by:** 02 — Roadmap spine.

**Status:** ready-for-agent

- [ ] Mapping module is pure and fixture-driven (captured payload snapshot; no live fetches in tests).
- [ ] Import succeeds only in transactional reality: either the whole roadmap lands with expected shape and counts, or nothing does.
- [ ] Imported roadmap supports every edit 02's builder supports (units/percent/next-up/known), proven by test, and the monthly-prototype vocabulary (freerobotics' "0/54") reads naturally on the result.
- [ ] Counted unit-hour estimates from source render as unit estimates where present.

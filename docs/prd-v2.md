# Locked In — The Learning Roadmap Engine (PRD v2)

> Status: Draft pending human review · Supersedes the *scope* of `docs/prd.md` (v1, "Deep Work Sanctuary", 2026-10-14), which is retained as the founding record of MVP-1. ADR-001…006 still govern unless explicitly retired below.
>
> One-line pitch: **"Locked In" stays the calm pomodoro app — but the pomodoro now fires against a learning roadmap, and learners are its first-class citizens.**

---

## Problem Statement

Self-directed learners have two broken tools, not one.

1. **Path tools die before effort begins.** Content for learning anything free is abundant (roadmap.sh, YouTube, Coursera audits…). The problem is never content — it's *order and consistency*. Open a famous course, binge for two weeks, drift to a "better" one, quit. freerobotics' opening thesis is exactly this: *"Almost nobody watches them in the right order, so almost nobody builds anything."* A path without a pace system dies in week two.
2. **Focus tools know nothing about learning.** This app today measures *focus effort* beautifully (append-only session log, derived streaks, heatmaps) but knows nothing about *direction*. A pomodoro started "on admin" and a pomodoro started "on vectors" weigh the same. Effort without direction cannot answer the learner's real questions: *Am I on pace? Where did my focus go? Is this roadmap alive or dead?*

The user — a solo learner executing a (possibly imported) path — needs ONE place where the path is visible, progress is measured in both units and hours, and the deep-work ritual is the engine that moves them along it.

## Solution

Locked In keeps its two-column sanctuary home and its entire pomodoro engine (session log, server-mirror timer, streaks) untouched, and grafts a learning spine onto it:

- **Roadmap → Milestone → Unit** (3 levels) replaces Task's flat list. Today's Projects become Roadmaps; today's Tasks become Units. Migration is in place; the append-only `sessions` log keeps its bindings.
- **Builder + import.** Users build roadmaps by hand — or import any public roadmap.sh roadmap (JSON → Milestones/Units, order and time estimates preserved) — or fork any published template.
- **A Plan per roadmap:** one weekly focus-hour target. The **Pace panel** reconciles logged hours vs plan (on track / at risk / stalled) and adds the roadmap dimension to existing stats.
- **Soft order + Next-up:** the app always points at the first incomplete Unit; nothing is gated.
- **Social lite:** publish a roadmap as a **Template**, fork others', approve-gated **Followers** see percent-done / streak / hours on that roadmap. Nothing else is social.
- **Careers, the pull side:** every roadmap can carry a user-authored **Career Ladder** of job rungs (title, company, pay, requirements) linked back to the Milestones they draw on — a top-level Careers page lists rungs across roadmaps, so the path visibly leads somewhere real.
- Everything ships **inside the Sanctuary** identity; existing stats screens remain untouched with additions only.

## User Stories

**Building & structuring**

1. As a learner, I want to create a roadmap with a name, so that my learning goal has a home.
2. As a learner, I want to add Milestones within a roadmap ("Month 1 — Math"), so that the path is phase-structured like a curriculum.
3. As a learner, I want to add Units under a Milestone with an optional time estimate, so that scope is sized honestly.
4. As a learner, I want to rename/archive/delete milestones and units, so that the builder isn't a waypoint cemetery.
5. As a learner, I want to drag-reorder milestones and units, so that I can encode the *order* I intend to follow.
6. As a learner, I want units to support fractional ordering like tasks do today, so that insertions don't rebuild the whole list.
7. As a learner, I want to mark a unit "already known", so that I get the placement effect without any assessment machinery.
8. As a learner, I want the roadmap to show "percent complete" (units checked) at roadmap and milestone level, so that progress is legible at a glance, freerobotics-style.

**Importing**

9. As a learner, I want to paste a roadmap.sh URL and get a roadmap with all groups as Milestones and topics as Units, so that I inherit a proven path instead of reverse-engineering one.
10. As a learner, I want imports to preserve roadmap.sh's natural order and skipped/optional node markings, so that structure survives the trip.
11. As a learner, I want to edit anything about an imported roadmap as if I'd built it, so that imports are a starting point, not a cage.
12. As a learner, I want import to fail loudly and safely (nothing half-created) when parsing goes sideways, so that a failed import never corrupts my data.

**Daily flow (the spine)**

13. As a learner, I want the two-column home to carry the roadmap panel (roadmap picker → its milestones/units), so that my sanctuary layout becomes a cockpit for the path.
14. As a learner, I want to select a Unit and have it bind to the timer exactly like the old active-task binding, so that the pomodoro ritual is unchanged from muscle memory.
15. As a learner, I want to start a session without binding anything, so that free-floating focus is still possible — logged, but not obligated.
16. As a learner, I want a "Next-up" pointer per roadmap, so that I never re-decide what to resume; I just confirm.
17. As a learner, I want to see the roadmap's unit-completion % and hours-logged side by side, so that completion and effort are both legible.
18. As a learner, I want today's streak and focus to still work exactly as before when sessions are bound to units, so that all my history carries over.

**Planning & pace**

19. As a learner, I want to set one weekly focus-hour target per roadmap, so that "the plan" is a single number I can actually keep in my head.
20. As a learner, I want the Pace panel to show plan vs actual hours for the current week per roadmap, so that drift is visible within days, not months.
21. As a learner, I want pace status words — on track / at risk / stalled — derived from my hours, so that the app speaks plainly instead of chart-dumping.
22. As a learner, I want a stalled-roadmap signal when a roadmap has had no bound focus time for ~2 weeks, so that dead paths are visible while they're resuscitable.
23. As a learner, I want the existing stats charts to gain a roadmap dimension (per-roadmap hours split), so that "where did my focus go" is answered without new screens.

**Social**

24. As a learner who built or curated a good roadmap, I want to publish it as a Template, so that others can start from my work.
25. As a learner, I want to delete/unpublish my Template at any time, so that publishing is reversible.
26. As a learner, I want to browse/lookup Templates and fork one into a private working copy, so that starting a journey is one click.
27. As a learner, I want my fork to be fully independent of the template afterwards, so that author and forker never couple their data.
28. As a learner with approved Followers, I want them to see percent-done, streak, and focus hours on that roadmap only, so that accountability works without exposing my private world.
29. As a learner, I want to approve/deny each follower request myself, so that visibility is consented, not default.
30. As a learner, I want to see the templates of people I follow, so that discovery flows through people.
31. As any user, I want a one-click report button that immediately hides a template pending review, so that abuse has a spotlight.
32. As a learner, I want publishing to require a verified email account, so that the anonymous device identity can't become a spam faucet.

**Careers (the pull side)**

33. As a learner, I want a Career ladder on my roadmap, so that the path visibly leads somewhere real and earns my week's focus hours.
34. As a learner, I want a top-level Careers page listing every rung across my roadmaps, so that the destination gets a seat beside Focus and Stats.
35. As a learner, I want each rung to carry title, company, pay range, requirement bullets, and degree-mention status, so that the target is as concrete as a real posting.
36. As a learner, I want a rung to link the Milestones it draws on ("on the path: M2, M3"), so that my roadmap is legible as career preparation.
37. As a learner, I want rungs ordered bottom-up within a ladder, so that the climb reads like a climb.
38. As a learner, I want to mark a rung as an entry route (side door) rather than a top target, so that ladders can start where I actually am.
39. As a learner, I want to create and edit every ladder and rung field myself, so that career goals are never pre-canned content I can't change.
40. As a template author, I want my ladder to fork with my roadmap, so that the pull side compounds through the template library without me authoring anything per-fork.

**Foundation & continuity**

33. As an existing user, I want my Projects to become Roadmaps and my Tasks to become Units with bindings intact, so that the upgrade costs me nothing.
34. As an existing user, I want my session history, streak, and CSV exports to be byte-compatible, so that all aggregates keep deriving truth (ADR-003 honored).
35. As an existing user, I want my in-flight timer (phase 3 of 4, long break) to survive the upgrade untouched, so that the ADR-005 server mirror contract holds across the migration.

## Implementation Decisions

*(decisions made during the grilling session, 2026-10-31; glossary terms in **bold** per `GLOSSARY.md`)*

**D-1 · Hierarchy.** Canonical model is **Roadmap → Milestone → Unit**, three fixed levels. No arbitrary-depth trees, no 4th "Task" level. Only Units bind sessions (optional), carry estimates, and count toward completion.

**D-2 · Schema evolution, in place.** `projects` → **`roadmaps`** (semantic rename of the concept, evolution of the table), `tasks` → **`units`** with a new `milestoneId` (nullable during transition: null means "milestone-less unit", legal while editing). `sessions.taskId`/`projectId` columns repoint semantically to uni t/roadmap ids; the log is append-only and never rewritten. All PRD-v1 aggregate seams (streak, daily totals, progress card, today summary) re-derive unchanged because they read `sessions`.

**D-3 · Plan representation.** A **Plan** is one integer weekly-focus-hours target attached to a roadmap. No calendar deadlines, no per-milestone dates, no finish-date forecasts in v1.

**D-4 · Pace semantics.** **Pace** = logged bound-hours in the current week vs the plan, evaluated on the existing timezone-aware day-grouping used for streaks/donuts. Status bands: *on track* (≥ plan pace), *at risk* (materially below plan but active this week), *stalled* (no bound session for ~2 weeks). Exact thresholds: implementation detail, pinned in code with tests.

**D-5 · Ordering.** Milestones and Units both get the fractional-order treatment already proven by the task system (`by_owner_active` composite index pattern, order-exhaustion throw). **Next-up** = first incomplete unit in roadmap order; computed, not stored.

**D-6 · "Already known."** A unit flag, exactly like completion but semantically distinct; excluded from "Next-up", included in "percent known" but not in "percent complete". No assessment framework exists anywhere in the schema.

**D-7 · Imports.** One source: roadmap.sh public structured roadmaps, fetched server-side (public content, no auth needed). Parse maps groups → Milestones, nodes → Units (title, description link if present, skipped/optional flag preserved, natural order preserved). Import is transactional in the Convex sense: plan fully, then write or abort — no half-roadmaps. All other sources defer to v2+.

**D-8 · Social model.** New shared-template surface: an author publishes a roadmap as a read-only **Template**; forking copies structure into the forker's private world and then severs all links. Followers approve-gated per-template; shareable signals limited to percent-done / streak / hours on that template's lineage. No public profiles, feeds, likes, comments, dashboards, or leaderboards.

**D-9 · Safety rails.** Publish requires verified email (anonymous-only accounts cannot publish). One-click report ⇒ template immediately hidden + flagged for the owner's (repo owner's) review. Approval gates follower visibility. These rails are structural (schema + owner resolution reuse), not an abuse pipeline.

**D-10 · Caps and guards.** The 100-active-project cap pattern carries to **Roadmaps** with the same intent (sanctuary restraint); unit counts may be larger (imports legitimately produce 50+ units) but the roadmap header, not the list, carries bulk display.

**D-11 · Identity carries.** Anonymous-first, merge-on-sign-in, CSV export/import, `identities` table, `resolveOwner` choke point — all carry forward unchanged. Publish/follow surfaces are the only new owner-relationship checks.

**D-12 · Visual identity.** The Sanctuary (`docs/design/`, five palettes, no-1px-dividers, JetBrains Mono, glass depth) is unchanged and extended, not redesigned. Roadmap density is expressed through the existing Arc UI componentry (charts, tables, timelines) and calm spacing.

**D-13 · Sequencing.** v1 lands in this order: (1) spine (hierarchy, builder, binding, Next-up), (1.5) careers page + ladder CRUD (needs only the roadmap model), (2) import, (3) pace panel + roadmap-slice stats, (4) social (publish/fork/follow + rails; forked ladders travel via the fork surface of this phase). Migration D-2 gates everything.

**D-15 · Careers architecture.** A **Career Ladder** is user-authored content attached to a Roadmap: ordered **Rungs** (bottom-up), each carrying title, optional company, optional pay range, requirement bullets, degree-mention status, a side-door flag (entry route vs target role), and links to the Milestones it draws on ("on the path" mapping at milestone granularity — no unit-level skill taxonomy, no readiness engine in v1). Ladder is part of a Template's published content and travels on Fork. Careers get a top-level page in the nav (Focus / Careers / Stats / Settings) listing every rung across roadmaps; the Sanctuary's visual rules apply to it as to any page. No curated career content is shipped by us (Q14 holds: the library fills through UGC ladders and imports).

**D-14 · Tests remain load-bearing.** Vitest + convex-test suites and Playwright e2e keep gating; design-rule DOM gates (no pure white / no 1px dividers) apply to all new UI.

## Testing Decisions

- **Behavior over implementation:** tests drive the app through its external seams, exactly as the existing 28-suite backbone does today.
- **Seam policy — reuse before invention.** The primary test seams:
  1. **Convex function seams** (highest, already proven): roadmap/milestone/unit mutations and re-written stats queries exercised via `convex-test` against the real schema, as `solution/`-style suites do for tasks/projects today. The schema morph (D-2) is validated here first: migrate-once then assert every old aggregate query still derives identically from the same session log.
  2. **Engine + pure-logic seam:** pace band logic (D-4). Pure module in `lib/`, equivalence-tested like `pomodoro.ts`/`streak.ts` — no new seams invented for what is arithmetic.
  3. **Import seam:** roadmap.sh JSON ⇒ roadmap-model mapping is a pure, fixture-driven mapping test (snapshot a representative roadmap.sh payload into the suite; no live fetch in tests).
  4. **UI/e2e seam:** Playwright specs for the migrated happy path (create roadmap → milestone → unit → bind → run → pace reflects) plus migration e2e (old-shaped DB seeds shift into new shape; aggregates unchanged).
- **Migration golden test:** a pre-recorded old-schema dataset (built by producers that exists in test today) must post-migrate yield identical sums — session count, focus minutes, streaks — via the same queries users see, as the accepted definition of "migration preserved truth."
- **Design-rule gates** run per-render on the new roadmap panel and pace UI, same as the timer page today.

## Out of Scope (v1)

- Placement assessments / self-checks (units marked "already known" covers the need, zero content dependency)
- Generic GitHub-markdown import, per-repo adapters, paste-outline import — only roadmap.sh JSON ships
- Weekly review digest screen, finish-date forecasting, per-unit time attribution — the Pace panel deliberately stays thin
- Cohorts, scheduled milestones, deadlines — the Plan is one weekly number
- **Job-post analytics (careers option C):** scraping real job boards, aggregating skill frequency / pay medians / degree rates à la freerobotics' 412-post table. Deliberately parked for a later version — the same shape as roadmap.sh import (a data *source*, decidable independently of v1). Meanwhile the ladder is hand-authored.
- Public profiles, activity feeds, likes/comments, leaderboards, live anything — templates + followers only
- UNlocked default sharing — publish/follow/report are consent-gated; nothing shares by default
- Any visual redesign: the Sanctuary is preserved (D-12)
- Mobile app, offline mode, i18n, PWA — carried unchanged from PRD v1's deferrals

## Success Criteria (11, testable)

*(Q20 settled 10; the careers branch — C1–C6 — added an eleventh rather than wedging careers into an existing criterion.)*

1. A user creates a roadmap, adds a milestone + ≥3 units, and each unit supports reorder/complete/"already known" — all covered by convex-test against the real schema, zero direct-DB poking.
2. A roadmap.sh URL import produces a roadmap whose milestones/units/order match the source structure, asserted against a fixed captured payload.
3. An imported roadmap is editable in every dimension a hand-built one is (rename, reorder, complete, archive) — same set of tests, no special paths.
4. Every session — bound or unbound — logs to the append-only log identically; bound sessions turnover to unit id so per-unit hours derive correctly (existing session seams, no new format).
5. Migration of a pre-migration dataset yields identical streak/daily totals/progress-card numbers through the same queries (golden-test above) — the migration ships only when this test is green.
6. The Pace panel shows plan vs actual for the current week per roadmap with on track / at risk / stalled, band logic equivalence-tested in `lib/` the way `pomodoro.ts` is.
7. The roadmap dimension appears on the existing focus-time charts without any existing chart's behavior changing (regression suites stay green untouched).
8. An email-verified user can publish a template; an anonymous-only user cannot; a reported template is hidden immediately to everyone but the author; delete/unpublish always works.
9. A follower sees only percent-done / streak / hours on approved roadmaps and cannot see anything else, by schema-level owner resolution (values asserted, not just UI hiding).
10. All existing vitest suites, Playwright specs, and design-rule gates pass unmodified-except-where-legitimately-morphed, and `typecheck`/`lint` stay clean — the "nothing broke" bar.
11. *(added when the careers branch was grilled in)* A rung CRUDs (create, edit, reorder, side-door flag, milestone links) via convex-test; forking a template containing a ladder inherits rungs mapped to the same milestones; the Careers page lists every rung across roadmaps; the ladder schema survives migration without changing any session-derived aggregate.

## Further Notes

- **freerobotics is in the soul of D-7/D-4:** the platform thesis tested by that site ("order is the product") is answered here by soft order + Next-up + a plan that *measures itself*, and by imports that hand you a career path in one click. The site was also the bar for pace-legibility: 0/54, hours, and a single weekly number.
- **Deferred naming:** tagline and landing copy move to launch-time (brand decision Q19 from the grilling session), tracked separately from this PRD.
- **PRD v1 relationship:** v1's scope sections (§4.1/§4.2) are superseded; v1's *identity*, *decisions D1–D10*, and ADRs 001–006 remain governing law except where D-2/D-8/D-9 here touch them. A new ADR should record the roadmap architecture cutover once the schema lands.
- **Open questions deliberately parked:** monetization/digital template authorship, notification nudging cadence (stalled signal), roadmap.sh edit-signal re-imports ("did the source update?"), i18n of imports.

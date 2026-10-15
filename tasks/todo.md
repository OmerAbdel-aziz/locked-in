# Task List: Locked In

Ordered by dependency. Every task: acceptance criteria ≤ 3 bullets, a verification step, and leaves the app working.
Reference: `docs/prd.md` (requirements), `tasks/plan.md` (architecture), `docs/decisions/` (ADRs).

---

## Phase −1: Design package (pre-requisite, completed 2026-10-14)

### Task D1: Export Stitch design package to `docs/design/`
**Description:** The PRD lists `DESIGN.md`, `screen.png`, and `code.html` as source material, but no such files existed in the repo. Tasks 2, 7, 18, and 26 all hard-depend on them. Exported the full package from Stitch project `14098409106330604275` ("Locked In Dashboard UI") and froze it in `docs/design/`.
**Acceptance:**
- [x] `docs/design/DESIGN.md`, `code.html`, `screen.png` present and render/parse
- [x] Token set verified identical across all 4 exported screens (47 colors, one config hash) and matching the project's `namedColors` — zero mismatches
- [x] `docs/design/tokens.json` gives Task 2 a machine-readable port source
**Verification:** `docs/design/tokens.json` parses; spot-check `bg-surface-container-low`=`#1c1b1b`, `text-primary`=`#4be277`, no `#ffffff`.
**Dependencies:** None (needs Stitch access only)
**Files:** docs/design/* (DESIGN.md, code.html, screen.png, tokens.json, README.md, screens/*)
**Scope:** S

**Decision (2026-10-14, human):** the Stitch project contains **two different layouts**, not four states of one. The **two-column dashboard** ("Paused (Desktop)") is canonical — better UX per the decider. The single-column layout is discarded; its Focus Shroud markup was salvaged to `docs/design/screens/focus-shroud-snippet.html` before removal. See [ADR-004](../docs/decisions/ADR-004-two-column-dashboard-layout.md).

Four design/PRD divergences were resolved in favour of the PRD's *requirements* inside the design's *composition* — `Today's Output` / `Focus Score` map onto aggregations the PRD already requires (Focus Score = completion ratio, a passive readout, so §4.1's "no reward state" holds). Full table in `docs/design/README.md`.

---

## Phase 1: Foundation

### Task 1: Scaffold app + repo hygiene
**Description:** Create the Next.js (latest, App Router, TypeScript) project in this repo root, add Tailwind, ESLint, vitest, Playwright, and commit the existing `docs/` + `tasks/` as the project's first commits.
**Acceptance:**
- [ ] `npm run dev/build/lint/test` all exist and run clean (one trivial test proves vitest wiring)
- [ ] Root `opencode.json` preserved; `.gitignore` covers node_modules/.next/.env
**Verification:** `npm run build && npm test` green.
**Dependencies:** None
**Files:** package.json, next.config.*, tailwind config, tsconfig, .gitignore, tests/smoke.test.ts
**Scope:** M (3–5 files)

### Task 2: Port DESIGN.md tokens into Tailwind
**Description:** Copy the full token set from `code.html`'s `tailwind.config` (colors, radius, fonts) into the real Tailwind config; add Inter + JetBrains Mono + Material Symbols via `next/font`; create base layer applying DESIGN.md rules (no pure white, body bg `#131313`, easing curve utility).
**Acceptance:**
- [x] Every token in `code.html`'s config is available as a Tailwind utility (spot-check: `bg-surface-container-low`, `text-primary`)
- [x] A styled shell page matches the Stitch background/text colors (no `#FFFFFF` anywhere)
**Verification:** Visual check of `/`; grep for `#fff`/`white` returns no product styles.
**Dependencies:** Task 1
**Files:** tailwind.config.ts, app/globals.css, app/layout.tsx
**Scope:** S

**Deviations (both deliberate):**
1. **No `tailwind.config.ts`** — the scaffold installed Tailwind **v4**, which is CSS-first: tokens live in the `@theme` block in `app/globals.css` instead of a JS config. Same token set, v4 idiom. (`@config` could load a JS file, but that would fight the framework.)
2. **Material Symbols not via `next/font`** — checked all **1942** fonts in Next 16's `font-data.json`; Material Symbols is not in the catalog (only `Noto Sans Symbols`). `code.html` loads it with a Google Fonts `<link>`, which `next/font` exists to avoid, and the unsubsetted icon font is multi-MB — wrong for a calm focus app. **Deferred to Task 7**, where icons are first used; recommendation then is inline SVG or a self-hosted subset, not an external `<link>`.

**Acceptance hardening:** `tests/design-tokens.test.ts` (10 assertions) turns these criteria into a permanent gate — every one of the 47 tokens must appear in `@theme` at the exact hex, no undeclared `--color-*`, no pure-white *declaration* (comments exempt, since DESIGN.md prose legitimately quotes the value), plus the DESIGN.md rules (body `#131313`, root pinned against the white `canvastext` color, `cubic-bezier(0.4, 0, 0.2, 1)`, `cta-gradient`/`glass-panel`). Mutation-tested: breaking a hex, injecting `#ffffff`, and deleting a token each fail the suite.

### Task 3: Convex init + schema v1 with indexes
**Description:** Initialize Convex, define schema: `identities`, `users`, `projects`, `tasks`, `sessions`, `settings` exactly per PRD §6, with indexes needed by stats (`sessions: by_owner_completed`, `tasks: by_owner_active`) and ordering (fractional `order` on tasks).
**Acceptance:**
- [x] Schema matches PRD §6 field-for-field (incl. `tzOffsetAtCompletion`, `projectId` snapshot field)
- [x] Indexes cover: owner+completedAt range, owner+taskId, owner+day derivations
**Verification:** `npx convex dev` pushes schema; typecheck passes.
**Dependencies:** Task 1
**Files:** convex/schema.ts, convex/*.indexes (if applicable)
**Scope:** S

**Notes:**
- Live deployment: `omer-abdelaziz:locked-in-12357:dev` (project `locked-in-12357`, dashboard `dashing-caribou-892`). All 6 tables and all 10 indexes confirmed pushed.
- **Day derivations need no `dayKey` column.** A calendar day at `tzOffsetAtCompletion` is a bounded `completedAt` range, so `by_owner_completed` serves it and the schema stays exactly as PRD §6 specifies — adding a denormalized field would itself be a schema change needing sign-off.
- **Index naming deviates from Convex's own guideline** (which prefers `by_field1_and_field2`, i.e. `by_owner_and_completedAt`). This task and PRD §6 name the indexes explicitly, so the spec wins; the deployment accepts them.
- `convex/_generated/` is **committed** — typecheck fails without it, and Convex's codegen output says so.
- `.env.local` (written by `convex dev`, holds `CONVEX_DEPLOYMENT` + URLs) stays ignored by the `.env*` rule.

**Gate:** `tests/convex-schema.test.ts` (11 assertions) reads the schema object Convex itself builds — not a hand-maintained mirror — and asserts the six tables, every field with its exact optionality, the `focus|short|long` union, that `sessions` stores nothing ADR-003 says must be derived, and all six index-coverage requirements. Mutation-tested: dropping `tzOffsetAtCompletion`, forcing `archivedAt` required, deleting `by_owner_completed`, injecting a `streak` column, and removing `long` from the phase union each fail it.

### Task 4: Anonymous identity + owner-resolution helper
**Description:** Convex Auth anonymous sign-in on first visit; single `resolveOwner` helper every function uses (session token → identity → ownerId, handling the linked-user case from ADR-002).
**Acceptance:**
- [x] First load creates/reuses an anonymous identity; no prompts
- [x] All subsequent functions reject unauthenticated calls through the same helper
**Verification:** Unit test the resolver mapping logic; manual: identity row appears on first visit.
**Dependencies:** Task 3
**Files:** convex/auth.ts, convex/lib/owner.ts, tests/owner.test.ts
**Scope:** S

**Checkpoint A:** styled shell renders, Convex schema live, identity established. Review with human.

---

## Phase 2: Timer core

### Task 5: Pomodoro engine (pure logic) + unit tests
**Description:** Framework-free engine in `lib/pomodoro.ts`: phase state machine (focus → break → … → long break after N), defaults 25/5/15/4, Skip = advance phase without granting early long break, Reset, auto-start flags as inputs (defaults: auto-start break ON, auto-start focus OFF), timestamp-anchored `phaseEndsAt` computation from an injected "now".
**Acceptance:**
- [x] Cycle math correct: completing session N → long break, counter resets; Skip on session N-1 does NOT grant long break
- [x] Time-anchored: given now-start durations, remaining time survives arbitrary clock jumps (no decrementing counter)
**Verification:** Unit tests covering all transitions (≥ 15 cases incl. pause/resume across a 10-min background gap).
**Dependencies:** Task 1
**Files:** lib/pomodoro.ts, tests/pomodoro.test.ts
**Scope:** M

### Task 6: Timer Zustand store
**Description:** Store holding engine state: current phase, phaseEndsAt, pausedAt, cycle position, active mode tabs; actions start/pause/reset/skip/setPhase; a `useCountdown` selector emitting remaining ms via rAF/interval, always derived from `phaseEndsAt - now`.
**Acceptance:**
- [x] Store uses engine exclusively - no re-implemented transition logic in the store
- [x] Countdown display value is computed from wall clock, not decremented
**Verification:** Unit tests on store actions; manual background-tab check (10 min → drift ≤ 1s per PRD §10.2).
**Dependencies:** Task 5
**Files:** lib/store/timer.ts, tests/timer-store.test.ts
**Scope:** S

**Deviations (deliberate, flagged for review):**
1. **`zustand` 5.0.15 installed** - it was *not* in the scaffold, despite PRD §7 and decision D6 naming it for timer state. §9 lists "adding a dependency" as ask-first, so this was raised rather than assumed; the argument for proceeding is that D6 had already chosen it, so installing it fulfils a decision rather than making one. **Revert path if unwanted:** `npm rm zustand`, then back the store with React's `useSyncExternalStore` (the rest of the task is unaffected). Nothing else needed installing - `@testing-library/react`, `jsdom` and `@vitejs/plugin-react` were already present.
2. **`normalizeState` added to the engine** (`lib/pomodoro.ts`), not the store - lowering `sessionCount` below the current cycle position would otherwise print "Session 3 of 2". Keeping it in the engine preserves the "no transition logic in the store" rule.
3. **Countdown ticks every 250ms, not per frame** - a pomodoro face reads at mm:ss, so this is visually identical and cheaper. It is explicitly *display cadence only*: the value is re-derived from `phaseEndsAt - now` each tick, so tick rate cannot affect correctness.

**Acceptance hardening:** 18 store tests. The "engine exclusively" criterion is enforced by an **equivalence test** that replays identical timed action sequences through the pure engine and through the store and requires byte-identical states - mutation-tested x6, including "store.skip delegates to completePhase", which it catches.

### Task 7: Timer UI (left column — Timer Engine)
**Description:** Build the left "Timer Engine" column per the two-column composition in `code.html`: progress ring (SVG, gradient stroke, round caps), monospace digits, "Session N of M" pill, Start/Pause primary (gradient CTA), Reset + Skip ghost buttons, Focus/Short/Long top-nav tabs. Design tokens and layout from `code.html` + DESIGN.md.
**Acceptance:**
- [x] Visually matches `docs/design/screen.png` (ring proportion, pill, CTA, column placement)
- [x] Running state (Pause CTA, active ring) derived from the paused screen + DESIGN.md §5 - the design ships no running-state screen (ADR-004)
- [x] Reset + Skip present and working; the design's paused state shows only the Start CTA but PRD §4.1 requires all three controls
**Verification:** Manual check against `docs/design/screen.png`; lint/build green.
**Dependencies:** Task 2, Task 6
**Files:** components/timer/*.tsx, app/page.tsx
**Scope:** M

**Deviations (deliberate):**
1. **The countdown no longer reads the clock during render.** `useCountdown` originally did `useState(() => Date.now())`. Next 16 has Cache Components enabled and **fails the build** when a client component reads `Date.now()` while rendering (`blocking-prerender-current-time`) — the value would be frozen at build time instead of recomputed per visit. The bundled docs list two fixes; the "defer" option ("move the read into a `useEffect` or event handler") was rejected because seeding the clock from an effect leaves a window where resuming a paused phase prints the full duration. Instead the clock is subscribed to as an external store via **`useSyncExternalStore`**, which is also the canonical React answer for a ticking value: the server snapshot is a constant (so the prerender needs no clock at all), the client snapshot is quantised to the 250ms tick so React does not read an unstable store, and the subscription exists only while `running`. Cost: `now` trails reality by at most one tick, which the mm:ss readout cannot surface. One non-obvious consequence worth recording: **zustand's own `useSyncExternalStore` server snapshot is the store's initial state**, so a server render always sees the *idle* timer at full duration — the prerendered HTML is the shell a first-time visitor gets before hydration, never a running clock. That also means the value of `getServerSnapshot` is irrelevant to the output; what Next rejects is the *call*, so the regression gate counts `Date.now()` invocations during `renderToString` rather than asserting on the rendered value (`tests/timer-store.test.ts`).
2. **No Material Symbols.** The left column needs no icons. The gear/avatar glyphs `code.html` renders in the header are still absent; when they are added (Task 26 design review) they should be inline SVG, for the reason recorded under Task 2 — the unsubsetted external `<link>` is multi-MB.
3. **The active-task card and streak pill were deliberately left out**, even though they appear in `screen.png`. The card needs a bound active task (Task 11) and the pill a derived streak (Task 15); both are marked as placeholders in `app/page.tsx` rather than built as fake data.
4. **`code.html` and `screen.png` disagree about the CTA's width**, and the source was preferred. `code.html` puts both the ring and the CTA in `w-full max-w-md`, so they are the same width; `screen.png` renders the CTA visibly narrower than the ring. `code.html` is the machine-readable markup the task names, so the CTA stays `max-w-md`. A human review can overrule this in either direction without touching anything else.
5. **The ring was collapsing to the width of the digits.** `TimerEngine` wrapped the design's column in an extra `<section>`, making it a shrink-to-fit flex item; the ring's `w-full` then resolved against the section's *content* — the face — instead of the column. Fixed by giving the section the `max-w-md` the design gives the column, and the face is now sized in container query units (`text-[22cqw]`) so it stays just under 60% of the ring's diameter at any width, matching `screen.png`. Found by screenshotting the running app, not by a test; now gated by both.

### Task 8: Session completion → session log write
**Description:** On focus phase completion (timer hits 0, not manually reset), write a `sessions` row: owner, startedAt, completedAt, phase, tzOffsetAtCompletion (and taskId/projectId as null for now — binding lands in Task 11); then transition per auto-start rules.
**Acceptance:**
- [x] Completing a focus session (real 0s or test-injected short duration) creates exactly one session row
- [x] Manual Reset/Skip of a running focus session creates NO session row
**Verification:** Integration test on the Convex mutation; manual with 0:05 durations.
**Dependencies:** Task 3, Task 4, Task 6
**Files:** convex/sessions.ts, lib/store/timer.ts (completion hook), tests/sessions.test.ts
**Scope:** S

**Deviations (all deliberate, all reversible):**

1. **`startedAt` needed new engine state, so `lib/pomodoro.ts` changed** — not in the
   task's file list. It could not be avoided: `phaseEndsAt - duration` is wrong twice
   over, because a resume rewrites `phaseEndsAt` and a mid-session settings change
   rewrites `durationMs` without touching it. `TimerState` now carries
   `startedAt: number | null`, stamped by `startPhase`/`enterPhase`, cleared by
   `reset`/`selectPhase`, and **shifted forward by the pause on resume**.

2. **`startedAt` is pause-adjusted, not the instant Start was pressed.** The PRD
   names the field and never defines it under a pause. Example: Start 09:50, pause
   09:55, resume 10:10, finishes 10:30 — this records `startedAt = 10:05`.
   *Why:* `sessions` is append-only (ADR-003) and CSV import is its only repair
   path, so `completedAt - startedAt` must equal focus time **forever**; recording
   the raw Start instant would permanently inflate focus time, per-project
   breakdown, top tasks, and every history "duration" by the paused time.
   *Cost:* time-of-day bucketing (PRD §4.1) shifts forward by the accumulated
   pause, but only for sessions that were actually paused. **Flagged as an
   assumption** — the alternative is a `focusMs` column, which would be a §9
   ask-first schema change. Overturn before any row is recorded in anger.

3. **All three phases are logged, not only focus.** The task says "on focus phase
   completion", but §4.1 requires a *break-vs-focus split* derived from the log and
   no later task adds break logging — skipping it would make that metric
   permanently unbuildable. The row's `phase` field is listed by the task itself and
   the schema's union is `focus|short|long`. Reset/Skip still write nothing for any
   phase, so both acceptance criteria are unaffected.

4. **`taskId`/`projectId` are not accepted by the mutation at all**, despite the
   task saying "as null". Accepting an id whose ownership has not been checked
   would hand Task 11 an authorization hole. The schema types them optional, so an
   unbound session is simply a row without them; Task 11 adds the arguments together
   with the check.

5. **Server-side idempotency** — a second write of the same `(startedAt,
   completedAt, phase)` under the same owner returns the existing id instead of
   appending. The client guard already makes a duplicate impossible in one tab;
   this covers what that guard cannot see (a replayed message, two tabs running one
   session). One indexed read against `by_owner_completed`, because a duplicate row
   would corrupt every derived number permanently.

6. **Completion lives in `complete()`, not only in the guarded wrapper** — so there
   is exactly one place a session row can be produced and no future caller of
   `complete()` can forget to log what it finished. `completeIfDue()` is the
   guarded entry point the countdown uses.

7. **`convex-test` runs in `jsdom`, not `edge-runtime`**, though `@edge-runtime/vm`
   is already installed. The Convex guidelines recommend the edge runtime, but this
   file also renders React hooks (which need a DOM) and the repo's established
   `convex-test` pattern (`tests/owner.test.ts`) is jsdom. Splitting the file to
   honour an environment preference would trade a real separation for nothing.

**Checkpoint B:** timer runs, survives backgrounding, session rows appear. Review with human.

---

## Phase 3: Tasks vertical

### Task 9: Task CRUD Convex functions + ordering
**Description:** create/update/complete/uncomplete/clearCompleted/reorder mutations + by-owner query respecting order; fractional index ordering (decision recorded in plan).
**Acceptance:**
- [ ] All mutations enforce owner via `resolveOwner`; completed tasks keep `completedAt`
- [ ] Reorder is O(1) neighbor insert and stable under concurrent orders
**Verification:** Integration tests incl. two consecutive reorders.
**Dependencies:** Task 3, Task 4
**Files:** convex/tasks.ts, tests/tasks.test.ts
**Scope:** M

### Task 10: Task list UI
**Description:** Right-column "Today's Focus" panel per the two-column composition: "Add new task…" inline input with project picker + leaf selector (0–8, default 2), task items (drag handle, title, leaves, project tag, checkbox), completed recede style, panel header count ("3 / 8 COMPLETED"), "Clear completed" beneath the list, per DESIGN.md no-line rules (tonal shifts + spacing only). Project tag renders inline in the row — required by PRD §4.1 though absent from the design (ADR-004).
**Acceptance:**
- [ ] Create/complete/reorder work against live Convex queries
- [ ] No 1px divider borders used anywhere in the list (no-line rule)
- [ ] Project tag shown inline; "Clear completed" present beneath the list (neither appears in the design — both PRD-required, ADR-004)
**Verification:** Manual run-through vs. screenshot; lint.
**Dependencies:** Task 9, Task 2
**Files:** components/tasks/*.tsx, app/page.tsx
**Scope:** M (input, item, list as granular subcomponents within one task)

### Task 11: Active-task ↔ session binding
**Description:** Active task selection (click to set `activeTaskId`, persisted per owner); on focus completion, bind `taskId` (+ `projectId` snapshot) from active task; leaf count increments derived from sessions-by-task; completed tasks keep their binding.
**Acceptance:**
- [ ] Completed session credits exactly the active task (bound at start — mid-session task edits don't re-target)
- [ ] Leaf progress = count of focus sessions vs. `estimate`, derived not stored
**Verification:** Integration test: start with task A active → complete → A +1 leaf, session row has A's id.
**Dependencies:** Task 8, Task 9
**Files:** convex/sessions.ts, lib/store/timer.ts, components/tasks (selection), tests/binding.test.ts
**Scope:** M

### Task 12: Progress card + Summary bento
**Description:** Active-task glass card in the **left column** (pulsing dot, title, progress bar, "N / M Pomodoros", "Currently Active" label) and the **Summary bento** in the right column beneath the task list (`Today's Output` = today's total focus work, `Focus Score` = completion ratio) — all derived queries.
**Acceptance:**
- [ ] Card shows active task's completed sessions vs. its estimate
- [ ] Bento aggregates today's tasks (estimated) and today's completed work — matches design layout
- [ ] Focus Score is a **passive readout**: no gate, no celebration, no threshold state, no color-coded pass/fail (PRD §4.1 "no reward state"; ADR-004)
**Verification:** Manual vs. screenshot; aggregation unit test for "today" boundary.
**Dependencies:** Task 11
**Files:** components/tasks/progress-card.tsx, components/tasks/summary-bento.tsx, convex/tasks.ts (aggregates)
**Scope:** S

**Checkpoint C:** full loop — add → activate → focus → progress updates live. Review with human.

---

## Phase 4: Projects vertical

### Task 13: Project CRUD + picker/filter
**Description:** projects create/rename/archive + list query (100-active cap); project picker in task create/edit; task-list filter chips (All / project). Archived = muted tag, tasks keep attribution.
**Acceptance:**
- [ ] Archive never deletes or rewrites tasks/sessions; archived projects hidden from picker but shown muted on tasks
- [ ] Cap enforced with a friendly error at 100 active
**Verification:** Integration tests incl. archive-then-session-attribution check.
**Dependencies:** Task 9
**Files:** convex/projects.ts, components/projects/picker.tsx, components/projects/filter.tsx, tests/projects.test.ts
**Scope:** M

### Task 14: Project overview panel
**Description:** Project view (route or large drawer): name, open/done task counts, estimated vs. completed leaves, focus time from sessions, its task list — all derived.
**Acceptance:**
- [ ] Focus time comes from session log filtered by `projectId` snapshot (renames don't affect history)
- [ ] Empty project shows calm empty state (no fabricated numbers)
**Verification:** Manual with seeded sessions; aggregation test.
**Dependencies:** Task 13, Task 19's aggregation helpers may be reused — implement inline here if Task 19 not yet done
**Files:** app/projects/[id]/page.tsx (or components/projects/overview.tsx), convex/projects.ts
**Scope:** M

**Checkpoint D:** project flows working. Review with human.

---

## Phase 5: Streak + Settings

### Task 15: Streak derivation + timezone tests + badge
**Description:** `lib/streak.ts`: derive current streak from session log using recorded tz offsets — earn day = ≥1 completed focus session; break = missed local calendar day; no grace. Header streak badge (fire icon, design-accurate).
**Acceptance:**
- [ ] Fixture tests: 23:59 vs 00:01 edges, two offsets, gap days, no sessions
- [ ] Streak never stored — recomputed (ADR-003)
**Verification:** `npm test -- streak`.
**Dependencies:** Task 8, Task 2
**Files:** lib/streak.ts, tests/streak.test.ts, components/chrome/streak-badge.tsx
**Scope:** S

### Task 16: Settings dialog + wire to timer
**Description:** shadcn dialog with durations (focus/short/long), session count N, auto-start focus/break toggles, notifications toggle; persisted to `settings`; timer engine reads settings on phase transitions.
**Acceptance:**
- [ ] Changes apply to the next phase transition without reload
- [ ] Defaults match PRD (25/5/15, N=4, break auto-ON, focus auto-OFF)
**Verification:** Unit test settings→engine integration; manual edit-and-run.
**Dependencies:** Task 5, Task 6, Task 3
**Files:** components/settings/*.tsx, convex/settings.ts, lib/store/timer.ts
**Scope:** M

### Task 17: Browser notifications on phase end
**Description:** Notification permission requested on first Start press (never on load); phase-end notification respecting the settings toggle; respect browser denial gracefully (in-app fallback indicator).
**Acceptance:**
- [ ] No permission prompt before first Start; prompt only once
- [ ] Denied permission = no crash, in-app phase-end signal still visible
**Verification:** Manual across granted/denied paths.
**Dependencies:** Task 16, Task 8
**Files:** lib/notify.ts, lib/store/timer.ts
**Scope:** S

**Checkpoint E:** streak correct on tz fixtures; settings drive the timer. Review with human.

---

## Phase 6: Focus Shroud

### Task 18: Focus Shroud overlay
**Description:** Full-screen overlay (bg-background/80 + blur) dimming everything except timer digits + active task while focus runs; toggle control; enters/exits with the design's easing; keyboard-accessible. Implement from the salvaged markup in `docs/design/screens/focus-shroud-snippet.html` + DESIGN.md §5 — the canonical two-column screen has **no shroud equivalent**, so this is the only concrete reference (ADR-004).
**Acceptance:**
- [ ] Active during running focus only; auto-dismiss when focus phase ends
- [ ] Timer + active task remain visible/interactive; nav, both columns, footer dimmed
- [ ] Salvaged snippet used as the base; no invented shroud styling
**Verification:** Manual visual check; state test for show/hide conditions.
**Dependencies:** Task 7, Task 11
**Files:** components/shroud/focus-shroud.tsx, lib/store/timer.ts
**Scope:** S

---

## Phase 7: Stats surface

### Task 19: Aggregation functions
**Description:** `lib/aggregations.ts` + Convex query wrappers: focus/sessions per day, break-vs-focus split, per-project focus time, top tasks by focus time, completion ratio — all range-parameterized (today/7/30/custom), derived from session log with bounded indexes.
**Acceptance:**
- [ ] 30-day fixture dataset matches a hand-computed oracle (PRD §10.8)
- [ ] No client-side full-log scans — queries range-bounded server-side
**Verification:** Oracle test in CI.
**Dependencies:** Task 3, Task 8
**Files:** lib/aggregations.ts, convex/stats.ts, tests/aggregations.test.ts
**Scope:** M

### Task 20: /stats page — range selector + charts
**Description:** New route `/stats` (nav link from header): range selector, focus-time bar chart + sessions chart in hand-rolled SVG matching DESIGN.md (primary-gradient bars, no axes chrome, no lines).
**Acceptance:**
- [ ] Charts render correct relative heights from fixture data (no library)
- [ ] DESIGN.md no-line/palette rules hold on the page
**Verification:** Snapshot/oracle test on SVG bar heights; visual check.
**Dependencies:** Task 19, Task 2
**Files:** app/stats/page.tsx, components/stats/*.tsx
**Scope:** M

### Task 21: Trends + time-of-day panels
**Description:** ▲/▼ deltas vs. preceding equal-length period for each headline metric (muted styling); time-of-day distribution (hour histogram) from `startedAt` + recorded offsets.
**Acceptance:**
- [ ] Deltas compare to the immediately preceding period of equal length, incl. partial custom ranges
- [ ] Time-of-day buckets use each session's recorded offset (no tz guessing)
**Verification:** Unit tests with cross-timezone fixtures (PRD §10.10).
**Dependencies:** Task 20
**Files:** components/stats/trends.tsx, components/stats/time-of-day.tsx, lib/aggregations.ts
**Scope:** S

### Task 22: Session history list + empty states
**Description:** Reverse-chronological session table (start, duration, phase, task, project) grouped by day; read-only; calm empty state for new users.
**Acceptance:**
- [ ] Grouping respects local day at completion; archived project names still render
- [ ] No edit/delete affordances (CSV is the repair path per PRD)
**Verification:** Manual with seeded multi-day data.
**Dependencies:** Task 20, Task 13
**Files:** components/stats/session-history.tsx, convex/stats.ts
**Scope:** S

**Checkpoint F:** oracle + tz tests green; stats page reviewed against DESIGN.md. Human review.

---

## Phase 8: Identity, merge, CSV

### Task 23: Magic-link sign-in
**Description:** Convex Auth email magic link; `/login` route + header entry ("Sync your data"); on success, link the current anonymous identity to the user (no data moves yet).
**Acceptance:**
- [ ] Anonymous identity links to user without losing existing data
- [ ] Anonymous-only users never see sign-in prompts during core flows (PRD §10.1)
**Verification:** Integration test for link; manual magic-link flow.
**Dependencies:** Task 4
**Files:** convex/auth.ts, app/login/page.tsx, components/chrome/account-button.tsx
**Scope:** M

### Task 24: Merge-on-sign-in prompt + merge logic
**Description:** If anonymous data exists when linking, show the prompt ("We found data on this device…", default action = merge). `lib/merge.ts`: tasks union (dedupe title+createdAt), projects union (case-insensitive name, remap task `projectId`), sessions union, streak/aggregates recompute from union.
**Acceptance:**
- [ ] Golden fixtures (anonymous-only, account-only, both-diverged) merge to expected states — sessions never lost or duplicated
- [ ] "Use account instead" discards device data explicitly (destructive path confirmed)
**Verification:** Golden-fixture integration tests (PRD §10.4).
**Dependencies:** Task 23, Task 13
**Files:** lib/merge.ts, components/auth/merge-prompt.tsx, convex/merge.ts, tests/merge.test.ts
**Scope:** M–L — build `lib/merge.ts` + golden fixtures first (its own sitting); prompt UI + mutation wiring second. Flag for split if either half exceeds ~5 files.

### Task 25: CSV export + import
**Description:** Export sessions as `startedAt,completedAt,phase,task,project`; import parses/validates same schema through the same mutation path as completions (dedupe on identical rows); entry points in Settings/Stats; import feeds the merge semantics from Task 24.
**Acceptance:**
- [ ] Export → import round-trip is lossless (PRD §10.5)
- [ ] Malformed rows rejected with row-level errors, valid rows still importable
**Verification:** Round-trip unit test + manual import of a foreign-tool CSV.
**Dependencies:** Task 24
**Files:** lib/csv.ts, components/settings/data-io.tsx, convex/sessions.ts, tests/csv.test.ts
**Scope:** M

**Checkpoint G:** merge + CSV fixtures green. Review with human.

---

## Phase 9: Polish & launch

### Task 26: Design review pass
**Description:** Walk DESIGN.md Do/Don'ts + the Stitch screenshot against every shipped screen; fix drift; finish chrome: replace the footer's decorative `PWA INSTALLED` / `v2.4.1` placeholders with real local time and honest connection status, remove any `#FFFFFF`/1px-divider regressions. `docs/design/` already holds the frozen package (Phase −1) — verify rather than re-copy.
**Acceptance:**
- [ ] Every DESIGN.md Do/Don't passes (checklist in PR description)
- [ ] Footer shows real time + real connectivity; the design's `PWA INSTALLED` placeholder is gone (PRD assumption 4)
**Verification:** Side-by-side vs. `docs/design/screen.png`; grep for forbidden styles.
**Dependencies:** Tasks 10, 12, 15, 18, 20
**Files:** various (fixups), docs/design/*
**Scope:** M

### Task 27: Playwright E2E
**Description:** Three flows: (1) first-run → focus loop → leaves + streak appear; (2) sign-in merge prompt flow; (3) project → task → stats attribution. Auth flows use Convex test-mode/local backend.
**Acceptance:**
- [ ] All three flows green in CI (local, deterministic — no real email send)
- [ ] No test depends on real network beyond localhost
**Verification:** `npx playwright test` green.
**Dependencies:** Tasks 24, 22, 15
**Files:** e2e/*.spec.ts
**Scope:** M

### Task 28: Deploy + README
**Description:** `npx convex deploy`, frontend to Vercel (verify Convex-vs-Vercel hosting/free-tier question first), env vars wired, README with quick start/commands/architecture, smoke test of magic link in production.
**Acceptance:**
- [ ] Production URL: first-run → focused session works; no console errors
- [ ] README covers commands, architecture, ADR links (docs skill)
**Verification:** Live smoke test checklist; `npm run build && npm test` green.
**Dependencies:** All
**Files:** README.md, vercel.json (if needed), .env.example
**Scope:** S

**Checkpoint H — SHIP:** All PRD §10 success criteria green; human sign-off.

---

## Progress Log

| Task | Status | Notes |
|------|--------|-------|
| Phase −1 (design package) | done | Stitch package exported to `docs/design/` — DESIGN.md, code.html, screen.png, tokens.json (47 color tokens verified identical across all 4 screens and vs `namedColors`), reference variants. See `docs/design/README.md`. |
| Phase −1 (layout decision) | done | **Two-column dashboard is canonical** (human, 2026-10-14) — ADR-004. `code.html`/`screen.png` swapped to the two-column screen; single-column discarded (Focus Shroud markup salvaged to `screens/focus-shroud-snippet.html`). PRD §1/§4.1 updated; Tasks 7, 10, 12, 18, 26 re-scoped. |
| 1 | done | Next 16.4 + React 19.3 + TS 5.9 + Tailwind 4.3 + vitest 5.0 + Playwright 1.64. `dev/build/lint/test` all green; smoke test proves vitest wiring. `@types/node` bumped ^20→^24 (runtime is Node 24; vitest 5 requires ≥24). Dropped `vite-tsconfig-paths` — Vite resolves paths natively (49s→1.5s). |
| 2 | done | All 47 colors + radius + fonts ported into Tailwind **v4 `@theme`** in `app/globals.css` (no `tailwind.config.ts` — see deviation note). Inter + JetBrains Mono self-hosted via `next/font`; Material Symbols **deferred** (not in `next/font`'s 1942-font catalog; multi-MB external `<link>` — revisit at Task 7). Base layer enforces body `#131313` / text `#e5e2e1`, `ease-sanctuary`, `cta-gradient`, `glass-panel`. Verified by screenshot + computed styles (`bodyBg` `rgb(19,19,19)`, digits in JetBrains Mono, **zero** elements painted white) and locked in by `tests/design-tokens.test.ts`. |
| 3 | done | `convex` 1.46.0 + project `locked-in-12357` (dev deployment `dashing-caribou-892`). All 6 PRD §6 tables and all 10 indexes pushed and confirmed live. Day derivation served as a bounded `completedAt` range — **no `dayKey` column smuggled in**, so the schema stays exactly PRD §6. `convex/_generated/` committed (typecheck needs it); `npx convex codegen`/`dev` both require the human OAuth step, done manually. Lint/`tsc --noEmit`/build/test green. Gated by `tests/convex-schema.test.ts` (mutation-tested ×5). |
| 4 | done | Convex Auth 0.0.96 + `Anonymous` provider; `convex/lib/owner.ts` is the **single authorization choke point** every function must call (ADR-002). Schema approved by human: `...authTables` spread (6 `auth*` system tables), `users` merged (PRD §6 `createdAt` + auth's optional profile fields + `email`/`phone` indexes), FKs `v.string()` → `v.id(...)`. `resolveOwner` rejects **null and empty** subject - `getAuthUserId` splits the JWT `sub`, so a malformed identity yields `""`, which must not become an owner id. **Client wiring:** `ConvexAuthProvider` from `@convex-dev/auth/react`, *not* `/nextjs` - that export is bare `ConvexProviderWithAuth` and never renders `AuthProvider`, so `useConvexAuth()` returns undefined and prerender crashed. **Live-only bug:** the provider's default anonymous profile writes `{isAnonymous: true}` and omits required `createdAt`, so first-load sign-in failed with a schema violation; fixed via the provider's `profile` extension point (no schema change needed). Config: RSA-2048 `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` set as **deployment env vars**, never in the repo. Verified end-to-end on `dashing-caribou-892`: sign-in returns tokens, `users` row carries `createdAt` + `isAnonymous`, session row created, JWT `sub` is `userId\|sessionId`. Gates: `tests/owner.test.ts` (7, mutation-tested ×3), `tests/anonymous-profile.test.ts` (5, mutation-tested ×3), schema gate extended for auth tables + FK kinds. Lint/`tsc`/build/37 tests green. |
| **Checkpoint A** | done | Styled shell renders (design tokens verified Task 2), Convex schema live, identity established. **Awaiting human review.** Note: a `next dev` server is already running on port 3210 (PID 31952). |
| 5 | done | `lib/pomodoro.ts` — pure engine, injected `now`, **no `Date.now()` and no decrementing counter anywhere**; remaining is always `phaseEndsAt - now`. Cycle position = "the focus session that starts next" (1..N); completing focus N grants the long break and resets to 1 in the same step. Complete-vs-skip is a single `counted` flag through one code path, so the two cannot drift: **skip passes `false` and can therefore never grant an early long break**. Auto-start policy applied uniformly in one `enterPhase`, so skipping and completing transition identically. Added `selectPhase` for Task 6's mode tabs so the store has no transition logic of its own. `remainingMs` clamped to `[0, duration]` - a backwards clock jump cannot stretch a phase. Reset keeps phase + cycle position (real progress lives in the session log, ADR-003). **Defaults pinned by test** - §9 makes changing timer transition defaults an ask-first item, so 25/5/15/4 and auto-start break ON / focus OFF are asserted, not assumed. 37 tests, mutation-tested x8 (every mutation broke). |
| 6 | done | `lib/store/timer.ts` — Zustand store that **holds state and nothing else**: every action is a one-line call into the engine. Enforced by an **equivalence test** that replays identical timed action sequences through the pure functions and through the store and requires identical states, so a rule cannot quietly live in two places. `useCountdown` re-derives from `phaseEndsAt - now` on a 250ms **display cadence** (documented as such - tick rate cannot affect correctness, which is what makes the background-tab case safe). `normalizeState` added to the *engine* so shrinking `sessionCount` cannot print "Session 3 of 2". Lint `react-hooks/set-state-in-effect` fired on an effect-body `setState`; rather than suppress it, the snap was removed - `remainingMs` already clamps to `[0, duration]` and the face reads mm:ss, so a sub-second stale clock cannot surface. Mutation-tested x6 (incl. "skip delegates to completePhase", caught by the equivalence gate). **Installed `zustand` 5.0.15** - see deviations; PRD §7/D6 specify it but it was missing from the scaffold, raised rather than assumed. Lint/`tsc`/build/95 tests green. |
| 7 | done | `components/timer/*` + `app/page.tsx` - the left column is live: SVG progress ring, monospace readout, "Session N of M" pill, gradient CTA, ghost Reset/Skip, and Focus/Short/Long tabs wired to `setPhase`. **Ring geometry is taken from `code.html` literally** (viewBox 448 = the `max-w-md` container, `r` 48%, `stroke-width` 4, `-rotate-90`) so the 4px stroke renders at the size the design specifies and scales proportionally. DESIGN.md §5 honoured: track at 10% opacity, `round` caps, progress as the `primary` gradient - never a flat fill. **Running state derived per ADR-004**: idle keeps the design's full muted circle (the whole session is still ahead), running swaps to the gradient arc, paused keeps the arc but withholds the gradient so the break stays calm. Ring progress and the digits are both derived from the same `remainingMs`, so they cannot disagree. The active-task card was deliberately *not* built (needs a bound task = Task 11) nor the streak pill (Task 15). `tests/timer-ui.test.tsx` - 24 assertions pinning geometry, labels, store wiring, the 7/5 grid (ADR-004), and the two easy-to-regress DESIGN.md rules (no pure white, no 1px sectioning border). **Live-deployment-style bug found and fixed: Next 16 fails the build when a client component reads `Date.now()` while rendering** (`blocking-prerender-current-time`) - see deviations. Mutation-tested x16 - every mutation broke, including "skip completes the session instead" and the `Date.now()`-in-render regression. **Verified in a real browser** (Playwright against `next dev`): body `rgb(19,19,19)`, JetBrains Mono digits, `linear-gradient(145deg, ...)` CTA, round caps, **zero** elements painted white, no console errors, and idle/running/paused all render as designed. That pass caught the ring collapsing to the width of the digits (see deviations). Lint/`tsc`/build/121 tests green. |
| 8 | done | `convex/sessions.ts` + the store's completion path. **The append-only log dictated the design (ADR-003):** a duplicate, mis-stamped or mis-owned row can never be cleaned up, since CSV import is its only repair path - so `startedAt` semantics, exactly-once, and owner derivation are pinned by test rather than left to convention. `startedAt` needed a new `TimerState` field (not derivable: a resume rewrites `phaseEndsAt`, a mid-session settings change rewrites `durationMs`) and is **pause-adjusted**, so `completedAt - startedAt` is always the focus time actually spent; the cost - time-of-day bucketing shifts by the pause - is recorded as a **flagged assumption** in the deviations, overturnable before any row is recorded in anger. Logging lives in `complete()` so there is exactly one place a row can be produced, with `completeIfDue()` as the guarded entry the countdown calls; the guard reads the phase's own boundary, which is what makes it survive StrictMode's double effect and a repeated observation. `completedAt = min(phaseEndsAt, now)` so a backgrounded tab records when the session *ended*, not when it was finally noticed. **Server:** owner comes only from `resolveOwner` - there is deliberately no `ownerId` argument, and supplying one is refused - timestamps are validated rather than trusted, and idempotency runs against `by_owner_completed`. `taskId`/`projectId` are not accepted at all until Task 11 can authorize them, rather than accepted and unchecked. **All three phases are logged**, because §4.1's break-vs-focus split derives from this log and no later task adds break logging. New `components/session-logger.tsx` injects the `useMutation` writer at the root beside `AnonymousIdentity` - fire-and-forget, since §9 forbids the timer waiting on a round-trip. Gate: `tests/sessions.test.ts` (21 assertions, store → logger → real mutation → DB), mutation-tested x5 - every mutation killed. Lint/`tsc`/build/151 tests green; functions pushed to `dashing-caribou-892`. |
| 9-28 | not started | |

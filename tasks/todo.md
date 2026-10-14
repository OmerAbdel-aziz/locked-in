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
- [ ] Every token in `code.html`'s config is available as a Tailwind utility (spot-check: `bg-surface-container-low`, `text-primary`)
- [ ] A styled shell page matches the Stitch background/text colors (no `#FFFFFF` anywhere)
**Verification:** Visual check of `/`; grep for `#fff`/`white` returns no product styles.
**Dependencies:** Task 1
**Files:** tailwind.config.ts, app/globals.css, app/layout.tsx
**Scope:** S

### Task 3: Convex init + schema v1 with indexes
**Description:** Initialize Convex, define schema: `identities`, `users`, `projects`, `tasks`, `sessions`, `settings` exactly per PRD §6, with indexes needed by stats (`sessions: by_owner_completed`, `tasks: by_owner_active`) and ordering (fractional `order` on tasks).
**Acceptance:**
- [ ] Schema matches PRD §6 field-for-field (incl. `tzOffsetAtCompletion`, `projectId` snapshot field)
- [ ] Indexes cover: owner+completedAt range, owner+taskId, owner+day derivations
**Verification:** `npx convex dev` pushes schema; typecheck passes.
**Dependencies:** Task 1
**Files:** convex/schema.ts, convex/*.indexes (if applicable)
**Scope:** S

### Task 4: Anonymous identity + owner-resolution helper
**Description:** Convex Auth anonymous sign-in on first visit; single `resolveOwner` helper every function uses (session token → identity → ownerId, handling the linked-user case from ADR-002).
**Acceptance:**
- [ ] First load creates/reuses an anonymous identity; no prompts
- [ ] All subsequent functions reject unauthenticated calls through the same helper
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
- [ ] Cycle math correct: completing session N → long break, counter resets; Skip on session N-1 does NOT grant long break
- [ ] Time-anchored: given now-start durations, remaining time survives arbitrary clock jumps (no decrementing counter)
**Verification:** Unit tests covering all transitions (≥ 15 cases incl. pause/resume across a 10-min background gap).
**Dependencies:** Task 1
**Files:** lib/pomodoro.ts, tests/pomodoro.test.ts
**Scope:** M

### Task 6: Timer Zustand store
**Description:** Store holding engine state: current phase, phaseEndsAt, pausedAt, cycle position, active mode tabs; actions start/pause/reset/skip/setPhase; a `useCountdown` selector emitting remaining ms via rAF/interval, always derived from `phaseEndsAt - now`.
**Acceptance:**
- [ ] Store uses engine exclusively — no re-implemented transition logic in the store
- [ ] Countdown display value is computed from wall clock, not decremented
**Verification:** Unit tests on store actions; manual background-tab check (10 min → drift ≤ 1s per PRD §10.2).
**Dependencies:** Task 5
**Files:** lib/store/timer.ts, tests/timer-store.test.ts
**Scope:** S

### Task 7: Timer UI (left column — Timer Engine)
**Description:** Build the left "Timer Engine" column per the two-column composition in `code.html`: progress ring (SVG, gradient stroke, round caps), monospace digits, "Session N of M" pill, Start/Pause primary (gradient CTA), Reset + Skip ghost buttons, Focus/Short/Long top-nav tabs. Design tokens and layout from `code.html` + DESIGN.md.
**Acceptance:**
- [ ] Visually matches `docs/design/screen.png` (ring proportion, pill, CTA, column placement)
- [ ] Running state (Pause CTA, active ring) derived from the paused screen + DESIGN.md §5 — the design ships no running-state screen (ADR-004)
- [ ] Reset + Skip present and working; the design's paused state shows only the Start CTA but PRD §4.1 requires all three controls
**Verification:** Manual check against `docs/design/screen.png`; lint/build green.
**Dependencies:** Task 2, Task 6
**Files:** components/timer/*.tsx, app/page.tsx
**Scope:** M

### Task 8: Session completion → session log write
**Description:** On focus phase completion (timer hits 0, not manually reset), write a `sessions` row: owner, startedAt, completedAt, phase, tzOffsetAtCompletion (and taskId/projectId as null for now — binding lands in Task 11); then transition per auto-start rules.
**Acceptance:**
- [ ] Completing a focus session (real 0s or test-injected short duration) creates exactly one session row
- [ ] Manual Reset/Skip of a running focus session creates NO session row
**Verification:** Integration test on the Convex mutation; manual with 0:05 durations.
**Dependencies:** Task 3, Task 4, Task 6
**Files:** convex/sessions.ts, lib/store/timer.ts (completion hook), tests/sessions.test.ts
**Scope:** S

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
| 2–28 | not started | |

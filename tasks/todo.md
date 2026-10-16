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
- [x] All mutations enforce owner via `resolveOwner`; completed tasks keep `completedAt`
- [x] Reorder is O(1) neighbor insert and stable under concurrent orders
**Verification:** Integration tests incl. two consecutive reorders.
**Dependencies:** Task 3, Task 4
**Files:** convex/tasks.ts, tests/tasks.test.ts
**Scope:** M

**Deviations (all deliberate):**

1. **The ordering decision is recorded, as the task asked** — PRD §11.4 and `tasks/plan.md` both deferred "fractional index vs. ranks" to this task. Recorded under *Architecture Decisions* in `plan.md`, with the full rationale and its one limit at the head of `convex/lib/order.ts`: **fractional, not ranks**, because ranks need a whole-list write for a single drag and two concurrent drags each renumber the list into a different shape, so one intent disappears. Keys stay `v.number()` — base-62 *strings* are the usual answer and never exhaust, but widening `tasks.order` is a schema field-type change, which §9 makes ask-first and which was not asked for. The cost of numbers: float64 absorbs ~52 successive inserts into *one gap* before there is no representable key, so `orderBetween` throws rather than emitting a duplicate (a duplicate leaves two rows tied forever, with the display resting on `_creationTime`). Appends never split a gap, so they do not spend that headroom.

2. **`uncomplete` clears `completedAt`** — flagged interpretation of the acceptance criterion, overturnable now while the log is empty. "Completed tasks keep `completedAt`" is read as *completing stamps it and later edits must not erase it* (pinned by a test). `completedAt` and `activeFlag` are then a matched pair per §6 ("present when done"), so reopening clears the stamp; leaving it would make the field's presence mean "last finished at" while every reader asks it "is it finished?".

3. **`reorder` refuses a neighbour from the other bucket** — `by_owner_active` indexes `(ownerId, activeFlag, order)`, so ordering is only meaningful *within* a bucket. A key computed across the open/completed boundary would say nothing about where the row sits among open tasks; a mix is rejected rather than written.

4. **An unnamed end anchors to the bucket, not to the named neighbour** — found by writing the tests, before any row existed. `beforeId: null` originally meant "unbounded above `afterId`", so `afterId.order + step` could land a drop at the end *inside* the list, quite possibly on top of an existing key; it also made one end-drag's result depend on whether another drag had moved a row. Both ends now resolve to the bucket's extreme, so a "send it to the front" drag and a "send it to the end" drag settle on the same arrangement whichever order they commit in.

5. **Naming neither neighbour is a no-op, and a row cannot be its own neighbour** — neither describes a gap between two rows, so picking an end here would be wrong half the time and *visibly* wrong only when the caller noticed; it is also the right outcome for dragging the only row in a list, whose neighbours, excluding itself, are nothing. A client that echoes the dragged row's own id back would otherwise send it to the end of the list, which reads as a drag that works. Both fail while Task 10's drag logic is still being written.

6. **`projectId` is accepted and authorized now, not later** — same reasoning as Task 8's `taskId`: PRD §4.2's create flow assigns a project, so adding the argument later would mean widening a mutation that already exists instead of checking it once at the choke point. `requireProject` runs the same owner test as `requireTask`, and `update` admits `projectId: null` to unbind (omitting the argument still means "leave it alone" — `patch` deletes a field given `undefined`, which is what makes the distinction real).

7. **`list` returns two bounded buckets rather than a paginated cursor** — `.take(1000)` each satisfies the Convex guideline on bounded collections without handing Task 10 pagination for a column the design draws as one list; `.take()` stops when the index range is exhausted, so the cap costs nothing below it. Splitting by flag is also the grouping the dashboard already needs — completed rows recede beneath open ones.

8. **`clearCompleted` deletes in batches of 100, capped at 50 rounds** — a mutation cannot `.collect()` and delete unboundedly, and reading the index afresh each round means rows removed earlier simply stop appearing. Past 5,000 finished rows one call stops and reports the count it removed; the next click continues. The test drives 101 rows so a single-round implementation cannot pass.

**Verification is the integration gate** (`tests/tasks.test.ts`, 45 tests): the O(1) criterion is asserted by requiring every *other* row's key to be bit-identical after a drag — a renumbering implementation cannot pass it — alongside two consecutive reorders, two drags issued simultaneously, the batch boundary, and the cross-tenant/refusal matrix. Mutation-tested ×10 (owner check, append anchor, both `completedAt` writes, bucket boundary, estimate range, both end anchors, batch limit, and a `reorder` rewritten to renumber the whole bucket): **every mutation killed.** No browser pass — this task ships no UI.

### Task 10: Task list UI
**Description:** Right-column "Today's Focus" panel per the two-column composition: "Add new task…" inline input with project picker + leaf selector (0–8, default 2), task items (drag handle, title, leaves, project tag, checkbox), completed recede style, panel header count ("3 / 8 COMPLETED"), "Clear completed" beneath the list, per DESIGN.md no-line rules (tonal shifts + spacing only). Project tag renders inline in the row — required by PRD §4.1 though absent from the design (ADR-004).
**Acceptance:**
- [x] Create/complete/reorder work against live Convex queries
- [x] No 1px divider borders used anywhere in the list (no-line rule)
- [x] Project tag shown inline; "Clear completed" present beneath the list (neither appears in the design — both PRD-required, ADR-004)
**Verification:** Manual run-through vs. screenshot; lint.

**Deviations:**

1. **`convex/auth.config.ts` added, plus two deployment env vars** — the browser pass failed at the first live call with `resolveOwner: unauthenticated callers have no owner`, and chasing it found that Task 4 shipped `convex/auth.ts` (which providers *exist*) but never `convex/auth.config.ts` (which issuers the *platform* will accept). The package's own `npx @convex-dev/auth init` writes both files plus a key-generation step that sets `JWT_PRIVATE_KEY` and `JWKS`; only the first was ever run. Three separate symptoms hid one cause, because sign-in *looked* like it worked: the token was issued, stored in the browser, and `useConvexAuth` reported `true` — and only the first call needing the session proved it never reached the server. In order, the pass saw `resolveOwner` refusing, then `AuthError: no providers configured`, then the socket dying in a 1013 `AuthProviderDiscoveryFailed` loop (`jwks.json` returning `500 Missing environment variable`). Tasks 8 and 9 never saw any of this: their gates run against `convex-test`, which stands in for the platform entirely. **Every authenticated call in the app has been failing since Task 4.** The keys live in deployment env vars, never the repo (PRD §9).

2. **The panel uses `useConvexAuth` from `@convex-dev/auth/react`, not `convex/react`** — the two hooks are not interchangeable and do not agree. `ConvexAuthProvider` keeps its own auth context and flips it when the anonymous sign-in lands; `convex/react`'s hook reads the raw client's auth state, which that provider never updates, so it reports `false` forever. Probed side by side on a live page: at t+5s the auth-package hook reads `true` and the convex-react one still reads `false`. A tidier single import would have silently pinned the panel to "unauthenticated" for every visitor. Same trap the provider file already documents for `/nextjs`.

3. **The list query is held back with Convex's `"skip"` literal until there is an identity** — a query issued during the first anonymous round trip reaches the server with no session and is correctly refused. `"skip"` keeps the subscription off entirely rather than sending an empty call, and the `undefined` it returns is already the "still settling" state the panel renders.

4. **The add pill is disabled until the identity exists** — gating the read leaves the *write* reachable, and a task typed in that window has no owner to be created under, so the server rejects it. `ready` is a prop on `TaskList`/`TaskInput`, and the guard is duplicated in the submit handler: `disabled` stops what a browser routes through the control, but a form submit can still arrive another way (jsdom proved exactly that by dispatching submit straight past it).

5. **Completed rows can be dragged *onto*, and land past the last open task** — PRD §4.2 doesn't cover this gesture, but a list that visibly accepts a drag and then does nothing reads as broken. Task 9 refuses to reorder across the `activeFlag` boundary, so the target is remapped to "after the last open task" rather than the drop being discarded.

6. **`TaskRow` is re-exported from `task-list.tsx`** — it is declared in `task-item.tsx`, but `tasks` is half of `TaskListProps`, so a consumer building a row list should not have to know which file owns the type. The first typecheck failed on exactly this.

7. **The completed-row treatment is `opacity-40` + `line-through`, title left on `text-on-surface`** — settled against `screen.png`. Applying DESIGN.md's variant-colour Do *as well* would double-dim below the design's own legibility, and PRD §4.2 names only opacity and strikethrough.

8. **The active-task marker renders from `row.isActive`, which nothing sets yet** — `activeTaskId` has no schema home until Task 11. Drawing the green rail on an arbitrary row would invent a selection nobody made.

**Gate** (`tests/tasks-ui.test.tsx`, 38 tests): drop algebra proved separately from drag plumbing (jsdom has no layout, so rectangles are stubbed and the decision lives in `lib/task-order.ts`); ordering, header count, estimate pass-through, toggle direction, `0/estimate` leaves, project tag position, clear-completed disabled state; the no-line rule asserted as *no `border-t/b/x/y`, no bare `border-l/r`, no `divide-*`, no `<hr>`* plus bare `border` permitted only on `role="checkbox"` (§5's affordance exception — the design's own markup draws it that way); no pure white. The page-level divider test in `timer-ui.test.tsx` was refined to match, since the panel is now part of the page.

**Browser pass** (fresh context against the live deployment, zero console errors): input disabled at first paint then released on identity; four creates with an explicit 6-leaf and the default 2; **dragging the first row below the third lands it third**; toggle moved the count to `1 / 4`; reload persisted all four with the completed row correctly sunk; clear-completed 4→3; panel left the deployment at `0 / 0`. The single `#fff` the DOM scan flags is Next.js's own error-page boilerplate in the serialized RSC payload, not a rendered element — no component in the app contains white.
**Dependencies:** Task 9, Task 2
**Files:** components/tasks/*.tsx, app/page.tsx
**Scope:** M (input, item, list as granular subcomponents within one task)

### Task 11: Active-task ↔ session binding
**Description:** Active task selection (click to set `activeTaskId`, persisted per owner); on focus completion, bind `taskId` (+ `projectId` snapshot) from active task; leaf count increments derived from sessions-by-task; completed tasks keep their binding.
**Acceptance:**
- [x] Completed session credits exactly the active task (bound at start — mid-session task edits don't re-target)
- [x] Leaf progress = count of focus sessions vs. `estimate`, derived not stored
**Verification:** Integration test: start with task A active → complete → A +1 leaf, session row has A's id.
**Dependencies:** Task 8, Task 9
**Files:** convex/sessions.ts, convex/tasks.ts, convex/lib/owner.ts, lib/store/timer.ts, components/tasks (selection), tests/binding.test.ts
**Scope:** M

**Deviations:**

1. **The binding is captured at start, not at completion (D8, settled)** — `startedAt → number` in the store is the instant the panel pushes `{taskId, projectId}` into it; `complete()` reads that snapshot, and the running phase never re-reads the selection. A mid-session click re-targets the *next* session only. The mutation refuses a session whose start instant has no binding, so a timer that outlives a deleted task fails loudly at the boundary instead of silently crediting nobody. Proved live: select A → start → click B mid-session → the completed session lands on A (B stays 0/2).

2. **Clicking the already-selected row clears the selection** — not in the PRD, but a control that can only ever *set* a selection gives no way back without completing the task. The checkbox click is `stopPropagation`'d so ticking a task can never double as selecting it. Both behaviours are pinned by DOM tests.

3. **`taskIfYours` tolerates a deleted task for historical bindings, refuses a foreign one** — the snapshot written into a session row must never dangle. If the task is gone, the row is written *unbound* (no `taskId`) and the user's `activeTaskId` pointer is repaired; if the task exists but belongs to someone else, the mutation throws rather than borrowing a stranger's work. Projects have no delete path (archive only), so `requireOwnedProject` is correct for `projectId`.

4. **`leafCounts` loops per task over the `by_owner_task` index** — one index range read per visible task, `phase === "focus"` filtered in memory. The index carries no phase, so break rows in the same range are read and discarded; a second schema index was not added because §9 makes schema changes ask-first and the loop is bounded by the list's own 1,000-row cap.

5. **`activeTask` and `leafCounts` are separate queries, not folded into `list`** — they change for different reasons (selection moves on every click; leaves move only when a session lands), and Task 9's tested `list` contract stays untouched. The panel gates all three with the same `"skip"`-until-identity rule.

6. **Keyboard selection makes each row a `tabIndex={0}` stop** — a click-only selection would be unreachable without a mouse. Enter/Space are guarded by `event.target !== currentTarget` so a keypress meant for the focused checkbox doesn't also select the row; the selected row reports `aria-current="true"` (not `aria-selected`, which is only legal inside a listbox).

7. **THE TIMER COULD FREEZE AT 00:00 FOREVER — fixed here, found by the live pass.** `useCountdown` derives from `ceil(now / 250) * 250`, an instant up to 250 ms *ahead* of the clock, so the face's `remaining` clamps to zero slightly *before* `phaseEndsAt` is really reached. `usePhaseCompletion`'s effect then fired once, `completeIfDue` read the real clock and rightly declined — and with a dependency array nothing could ask again, because `remaining` cannot leave 0 and `status` stays `"running"`. The phase sat at 00:00 indefinitely and **no session was ever written on the real clock**, which is exactly what Checkpoint B had been waiting to see. The effect is now deliberately un-gated (re-checks every render; safe because `completeIfDue` re-reads the clock and is idempotent by construction), with a regression test that fails against the dependency-gated version. This is a Task 6/8 bug, not a Task 11 one — it had hidden because every prior gate drove `completeIfDue` directly with a controlled clock, never the React effect's *re-check* behaviour.

**Gate** (`tests/binding.test.ts`, 21 tests + selection/derivation cases in `tests/tasks-ui.test.tsx`): two owners in one DB; selection persists/refuses/clears and survives completing the selected task; `logCompleted` binds, refuses foreign task and foreign project, tolerates a deleted one (row unbound, pointer repaired), and never re-binds on a repeat; the D8 store suite (capture at start, mid-session re-target forbidden, pause/resume keep, reset releases, idle never bound, unselected logs nothing); `leafCounts` focus-only/per-task/zero; the acceptance test drives select → start → complete → row + count. Mutation-tested ×2, both reverted: logging the *live* selection instead of the start snapshot fails exactly the "does not re-target" test; returning the live selection instead of the snapshot fails six, including the acceptance criterion. New regression test for deviation 7 fails against the old dep-gated effect.

**Browser pass** (fresh context, live deployment, zero console errors): click selects (rail + `aria-current`), click moves it, ticking a task does not move the selection, selection survives a reload, clear-completed of the selected task repairs the pointer (rail gone), select → start binds, mid-session click does not re-target, and the completed focus session lands on the start-bound task — **A 1/2, B 0/2** — which is also the first successful live write of a session row, closing Checkpoint B's open question. The pass found deviation 7 by stalling at 00:00.

### Task 12: Progress card + Summary bento
**Description:** Active-task glass card in the **left column** (pulsing dot, title, progress bar, "N / M Pomodoros", "Currently Active" label) and the **Summary bento** in the right column beneath the task list (`Today's Output` = today's total focus work, `Focus Score` = completion ratio) — all derived queries.
**Acceptance:**
- [x] Card shows active task's completed sessions vs. its estimate
- [x] Bento aggregates today's tasks (estimated) and today's completed work — matches design layout
- [x] Focus Score is a **passive readout**: no gate, no celebration, no threshold state, no color-coded pass/fail (PRD §4.1 "no reward state"; ADR-004)
**Verification:** Integration test in `tests/summary.test.ts` drives real sessions through `logCompleted` and asserts the day-window arithmetic against a device offset; DOM tests pin the "no grading" invariant as "the colour does not vary with the value".
**Dependencies:** Task 11
**Files:** components/tasks/progress-card.tsx, components/tasks/summary-bento.tsx, convex/tasks.ts (aggregates), lib/use-tz-offset.ts, tests/summary.test.ts
**Scope:** S

**Deviations:**

1. **"Today" is the device's local midnight, computed from an offset the client sends (PRD D5, settled)** — the server has no idea where the device is, so `useTzOffsetMinutes()` supplies `-new Date().getTimezoneOffset()` as a query arg and `startOfLocalDay` shifts *then* floors. The first version floored *then* shifted, which passes every afternoon case and names **tomorrow's** local midnight for a device reading an early-morning UTC instant (a UTC-5 device at 01:00Z is living in yesterday's evening); the boundary test pins exactly the case that distinguishes the two orders. The offset is data about a clock, not identity — a wrong value can only move one of the user's own rows between their own days, and the next load corrects it.

2. **The card and the bento are separate queries, not one** — `progressCard` lives in the left column beside the timer and moves on every selection; `todaySummary` lives in the right column and moves only when a session lands. They share `focusLeafCount` so the leaf count the card shows and the one the bento's ratio divides by cannot disagree; a dead or foreign `activeTaskId` resolves to `null` (a calm "Nothing selected yet"), never a borrowed stranger's task.

3. **Focus Score's denominator is the current board, not today's tasks** — sessions snapshot task identity (D8), never an estimate, so an estimate can only be read off the task as it stands; a task cleared after its sessions would otherwise silently shrink the denominator. Score is `null` → "—" when the denominator is 0, because an empty board is no score rather than a score of zero. Today's Output sums `completedAt − startedAt` over focus phases only — breaks can never count, by construction of what gets logged.

4. **The pulsing dot is tied to "something is live", not "something is selected"** — an empty card renders no dot at all instead of a muted non-pulsing one, and the bento's settling state renders zeros (the same shape a brand-new account has) rather than fabricating a number while the query is in flight.

5. **`useTzOffsetMinutes` uses `useSyncExternalStore`** — Next 16's `blocking-prerender-current-time` rejects clock calls during client render (the same rule that shaped `useCountdown` in Task 7), so the hook has an inert subscribe and a server snapshot of 0; the real offset appears on the client's first committed render, which is the same tick the gated queries are allowed to fire.

**Gate** (`tests/summary.test.ts`, 13 tests): `startOfLocalDay` both offsets, a UTC device, and the early-morning previous-day case that catches the flooring-order bug; `progressCard` untouched → `null`, title/estimate/leaf-count, focus-only, dead pointer → `null`, foreign pointer → `null`, unauthenticated → throws; `todaySummary` focus-only sum with a paused span, board-wide denominator including a cleared task, two-offset day boundary at UTC midnight ±minutes, and recompute-not-remembered across a second write. All sessions go through the real `logCompleted`, which is what makes each fixture obey the duplicate-refusal rule (a repeat of one `(ownerId, completedAt)` is the replayed message it was built to refuse) — two fixtures initially reused one completion instant and the second was correctly dropped.

**Browser pass** (fresh context, live deployment, port 3000, zero console errors): empty states calm (card "Nothing selected yet" with no pulse, bento 0.0 hrs / —), two tasks take the bento to a real 0% (the denominator is the board), selecting titles the card and starts it at 0 / 2 with the dot pulsing, and a completed focus session moves the card to **1 / 2 Pomodoros at 50%** and the bento to **0.1 hrs / 25%** on its own. DESIGN.md holds on the rendered page: no pure white, no directional 1px lines, the card's ghost border present.

**Checkpoint C:** add → activate → focus → progress updates live — **passed** (the browser pass above is that loop). The two derived surfaces recomputed from a real session write with no page reload. Awaiting human review.

---

## Phase 3.5: HeroUI migration + typeface + theme scaffolding

**Why this phase exists (PRD D6a/D6b/D6c, revised 2026-10-16):** the app currently uses zero component libraries and a dark-only, mono/Inter design. Before Projects builds anything new, the foundation moves to HeroUI v3 so nothing is built twice, and the typeface + theme groundwork lands early.

**The three themes are already specified** — see `docs/design/heroui-themes.css` (committed; the three `temp.css` palettes, each with light + dark, in HeroUI's own `data-theme` token vocabulary). Phase 3.5b ports them; it does not invent them.

**The build-from-scratch rule (D6a):** if HeroUI ships the component, use it. Hand-written is permitted for exactly two things — the **drag-and-drop task list** (HeroUI has no DnD; Task 10's hand-rolled HTML5 stays) and **glass/gradient surface styling** (CSS, not a component). Everything else — buttons, tabs, inputs, checkboxes, cards, modals, the project picker (Task 13) and filter chips — comes from HeroUI.

**HeroUI's fit is good, not a fight:** it is built on **Tailwind v4 + React 19** — this repo's exact stack — and uses standalone `@heroui/styles` CSS with BEM classes (no className threading) plus React Aria for accessibility. No className-vs-BEM war to fight.

### Task 13.5a: Install HeroUI + repoint the typeface
**Description:** `@heroui/react` + `@heroui/styles` installed; the `@import "@heroui/styles"` line added to `globals.css`; the three `shadcn/ui` references in `docs/prd.md` already changed to HeroUI. Then **all-JetBrains-Mono** (D6c): repoint `--font-sans`, `--font-mono`, `--font-headline`, `--font-body`, `--font-label` at `var(--font-jetbrains)` (already self-hosted via `next/font`), drop the Inter import from `layout.tsx`, and update `docs/design/typography.md` to record the superseded mono/Inter pairing. JetBrains Mono is already loaded — this is a token repoint, not a font add.
**Acceptance:**
- [x] HeroUI installed; `@heroui/styles` imported; dev server, `tsc`, lint clean
- [x] No Inter anywhere; every font token resolves to JetBrains Mono
- [x] `docs/design/typography.md` records that mono/Inter is superseded
**Dependencies:** Task 12 (current foundation)
**Files:** package.json, app/globals.css, app/layout.tsx, docs/design/typography.md
**Scope:** S

**Deviations:**
1. **`tailwind-variants` installed alongside** — `@heroui/react`'s peer dependency; the install is incomplete without it.
2. **JetBrains Mono gains weight 400** — body copy now sets in Mono and needs a text weight; the loader previously carried only 500/700. The `--font-jetbrains` variable name is kept so CSS tokens repoint without renaming.
3. **`docs/design/typography.md` created, not updated** — it did not exist; the task's "update" is its first revision, recording the supersession.

### Task 13.5b: Theme scaffolding (light/dark + three palettes)
**Description:** port the three themes — Mint (default, hue 155°), Airbnb (17°), Rabbit (36.66°), each with a **light and a dark** variant — from `docs/design/heroui-themes.css` (committed; the source-of-truth copy of the root's `temp.css`) into `globals.css` as HeroUI `data-theme` tokens (D6b). Make the CTA gradient **theme-aware**: each theme supplies its own two-stop gradient (accent + darker sibling) as a token, keeping the fixed `145°` geometry. Wire `--font-sans`/`--font-mono` at JetBrains Mono so the themes' own `--font-sans` tokens (which reference Inter) are overridden. Theme *switching UI* is Phase 5 — this task is the token groundwork only.
**Acceptance:**
- [x] Three themes × light/dark resolve via `data-theme`
- [x] CTA gradient is a per-theme token at fixed `145°`
- [x] `--font-sans`/`--font-mono` point at JetBrains Mono, overriding the themes' Inter reference
- [x] DESIGN.md's dark-only `#131313` body and its "no pure white" rule are both marked **STALE** (done in the design doc); the `timer-ui`/`tasks-ui` DOM tests that enforced them are **re-derived for light/dark** — the no-pure-white rule is relaxed in light mode, kept for the dark themes
**Dependencies:** Task 13.5a
**Files:** app/globals.css, docs/design/DESIGN.md, docs/design/heroui-themes.css, tests/timer-ui.test.tsx, tests/tasks-ui.test.tsx
**Scope:** M

**Deviations:**
1. **Selectors namespaced per palette** — the source repeats `:root/.light/.default/[data-theme="light"]` for all three palettes, which would collapse into one cascade. Each palette resolves under its own name (`mint`, `airbnb`, `rabbit` + `-dark`); `:root` carries mint-light per HeroUI convention, `layout.tsx` sets `data-theme="mint-dark"` so first paint stays the dark product, and `[data-theme="dark"]`/`.dark` alias mint-dark.
2. **CTA darker siblings invented, values recorded in `globals.css`** — the source palettes ship no gradient stops. Each theme gets `--cta-from` (its accent) + `--cta-to` (darker sibling: mint 66%/0.14, airbnb 54%/0.21, rabbit 55%/0.20) at the fixed `145°`; the legacy primaries are the pre-theme fallback.
3. **Legacy 47-token `@theme` kept verbatim** — components repoint slice by slice in 13.5c/d, so the old utilities keep resolving until their owners migrate. The design-tokens gate still pins all 47 hexes; only the body/root/light-mode assertions were re-derived for the supersession.
4. **No-white DOM gates kept unconditional (stricter than the STALE note requires)** — the note relaxes the rule in light mode, but the assertions check literal hex/white utilities in markup, and no theme introduces any: light surfaces are oklch tokens, invisible to those assertions. Nothing needed relaxing; computed light surfaces are a browser-pass concern (Checkpoint B2).
5. **Known collision: `bg-background` / `bg-surface` utilities still resolve to legacy hexes** — both `@theme` blocks define `--color-background`/`--color-surface`, and the legacy block wins its collisions. Theme-awareness flows through direct `var(--background)`/`var(--surface)` references (body, CTA, glass, and all HeroUI component internals), never through the colliding utilities. Do not use those two utilities for theme-aware surfaces until the legacy `@theme` retires in a later phase.
6. **`temp.css` deleted** — `docs/design/heroui-themes.css` remains the committed source of truth.

### Task 13.5c: Rewrite the timer onto HeroUI
**Description:** CTA + Reset/Skip → **Button**; Focus/Short/Long tabs → **Tabs**; progress ring → **ProgressCircle** *if* its determinate API reproduces the design's 448-viewBox / r 48% / 4px-stroke / `-rotate-90` / round-cap geometry — else keep the hand-written SVG (geometry beats library, and the ring is the app's focal element). Re-derive the `timer-ui` DOM assertions against the new markup; keep every rule that still holds (no pure white, no sectioning borders, round caps, gradient-from-same-`remainingMs`).
**Acceptance:**
- [x] Ring geometry bit-identical to the design package, whichever implementation wins
- [x] No pure white; no 1px sectioning borders; CTA gradient intact
- [x] `tests/timer-ui.test.tsx` green against the HeroUI markup
**Dependencies:** Task 13.5a, Task 13.5b
**Files:** components/timer/*, tests/timer-ui.test.tsx
**Scope:** M

**Deviations:**
1. **Ring kept hand-written (geometry beats library, documented in `progress-ring.tsx`)** — ProgressCircle's custom-SVG props *can* reproduce the viewBox/r/stroke, but its `color`-per-instance model has no equivalent for the idle-full-muted vs. running-gradient vs. paused-muted-arc three-state semantics, the gradient def + 10%-opacity track are custom SVG either way, and its min/max/value model fights the 0..1 elapsed fraction. All six ring geometry tests unchanged.
2. **Handlers through `onPress` only** — wiring both `onPress` and `onClick` double-fires on a mouse click (probed). `fireEvent.click` fires `onPress`, so the store tests drive the visitor's path.
3. **Tabs need two jsdom stubs** (`ResizeObserver`, `Element.getAnimations`) — both are browser-only measuring/animation; the stub block in `timer-ui.test.tsx` records why each is faithful. Tab queries re-derived from `button` to `tab` role (React Aria).

### Task 13.5d: Rewrite tasks, card + bento onto HeroUI
**Description:** task input → **TextField**/**Input**; row checkbox → **Checkbox**; **TaskList/TaskItem keep the hand-rolled HTML5 DnD** (HeroUI ships none) but their *surfaces* adopt HeroUI tokens; progress card + summary bento → **Card**/**Surface** with theme-aware tokens. Re-derive `tasks-ui` assertions; the drag algebra (`lib/task-order.ts`, pure) is untouched — only the DOM that hosts it changes.
**Acceptance:**
- [x] Card/bento ghost borders and the divider rules still hold under the new markup
- [x] Focus Score stays a passive `text-primary` readout at every value
- [x] DnD still works; `tests/tasks-ui.test.tsx` green
**Dependencies:** Task 13.5c
**Files:** components/tasks/*, tests/tasks-ui.test.tsx
**Scope:** M

**Deviations:**
1. **Leaf 0–8 selector stays a native `<select>`** — HeroUI ships no compact number-picker; a full Select dropdown for nine single digits would be chrome the design never asked for. Only the text field moved to TextField/Input.
2. **Checkbox stopPropagation moved to a wrapper `<span>`** — independent of HeroUI's internal slot structure; the row's keyboard guard (`event.target !== currentTarget`) is untouched.
3. **Indicator uses a render function, not static children** — static `null` children fall through to HeroUI's default checkmark SVG (read in `node_modules/@heroui/react/dist/components/checkbox/checkbox.js`), leaving a hidden-but-present mark in every unchecked box.
4. **Bare-border affordance test re-derived** — HeroUI's `checkbox__control` carries the `border` class instead of a `role="checkbox"` button; the assertion now accepts both shapes.
5. **Row/bento/card surfaces keep legacy token classes** — Card shells carry the ghost border + tonal fill as classes (so the divider/ghost assertions hold verbatim); a full legacy→HeroUI token remap waits on the legacy `@theme` retirement (see 13.5b deviation 5). `lib/task-order.ts` untouched.

**Checkpoint B2:** whole app on HeroUI + all-mono + both modes of a theme rendering. Full gate (tests, lint, `tsc`, build) + browser pass in light *and* dark. Review with human.

**Audit follow-up (2026-10-16, taste-skill audit-only pass):** applied immediately per human instruction.
1. **Ring minimized** — engine/controls/progress-card measure dropped `max-w-md` → `max-w-xs` (320px display; SVG viewBox stays 448 units, ratios bit-identical). Timer-ui width pin re-derived.
2. **Mobile overflow fixed** — grid columns + engine/controls carry `min-w-0` so the ring column no longer bleeds off 390px viewports.
3. **HeroUI tab-track border removed** — the secondary variant's full-width `border-b` on `.tabs__list-container` violated the no-line rule; overridden in `globals.css` (gated in design-tokens tests). The active-tab indicator stays.
4. **Empty-list guidance** — one calm line while the board is empty; leaves with the first task (gated both ways).
5. **Live footer** — `components/chrome/status-footer.tsx`: real local time (1s tick) + online/offline indicator replace the placeholders (Task 26 precursor, gated in `tests/status-footer.test.tsx`). Mount-gated for the prerender rule.
6. **Entrance motion** — staggered `.enter`/`.enter-1..3` rise at sanctuary easing, pure CSS with `prefers-reduced-motion` fallback (gated for presence + fallback).
7. **Meter FAILs rejected with cause** — gradient CTA, glass, all-mono, micro-labels, zero pictures/footage are DESIGN.md/PRD bindings for a tool, not a story page; shadow FAILs are zero-alpha HeroUI base styles (meter noise). `lint.mjs` could not run (Windows path resolution); `inspect.mjs` ran clean at 1440/768/390.

---

### Task 13: Project CRUD + picker/filter
**Description:** projects create/rename/archive + list query (100-active cap); project picker in task create/edit; task-list filter chips (All / project). Archived = muted tag, tasks keep attribution.
**Acceptance:**
- [x] Archive never deletes or rewrites tasks/sessions; archived projects hidden from picker but shown muted on tasks
- [x] Cap enforced with a friendly error at 100 active
**Verification:** Integration tests incl. archive-then-session-attribution check.
**Dependencies:** Task 9
**Files:** convex/projects.ts, components/projects/picker.tsx, components/projects/filter.tsx, tests/projects.test.ts
**Scope:** M

**Deviations:**

1. **Plus `unarchive` and the CRUD surface, minus the edit-form picker** — `unarchive` restores an archived project under the same 100-active cap (an archive with no way back is a one-way trap; a mis-tap would orphan tasks from every picker). The CRUD lives in `components/projects/project-manager.tsx` (create input + inline rename + archive/restore, cap refusal in `tertiary`) beneath the task list. There is no *edit-form* picker because no task-edit UI exists yet (Task 10 built create/toggle/reorder only) — the picker rides the add pill; `tasks.update` already accepts `projectId` rebinding (tested Task 9), so the mutation path is ready when an edit form lands.
2. **Filter chips include archived projects (muted), the picker excludes them** — the acceptance criterion's split, made explicit: hiding an archived chip would strand its still-boarded tasks with no way to isolate them, while offering an archived project as a *new-task destination* would birth tasks under a muted tag.
3. **Selecting a chip arms the picker with that project** — creating while viewing a project files there; "All" lifts the filter without disarming the picker. Both are unpersisted client state.
4. **Names are not deduped at creation** — two projects may share a name; Task 24's merge unions them case-insensitively. Refusing duplicates at creation would make the merge's job ambiguous.

**Gate** (`tests/projects.test.ts`, 20 tests): blank/over-long names, trim, 100-active cap (+ archive frees a slot), rename rules, archive idempotency, the acceptance test (task + session read back field-identical after archive), cross-tenant refusal matrix, unauthenticated refusal of all six functions. `tests/projects-ui.test.tsx` (24 tests) pins the chips/picker/manager gestures, the `toTaskRows` id→name+muted join, and the no-white/no-line rules on the new surfaces. The panel-gate test in `tasks-ui.test.tsx` now expects five subscriptions (the panel's `projects.list` plus the manager's own).

### Task 14: Project overview panel
**Description:** Project view (route or large drawer): name, open/done task counts, estimated vs. completed leaves, focus time from sessions, its task list — all derived.
**Acceptance:**
- [x] Focus time comes from session log filtered by `projectId` snapshot (renames don't affect history)
- [x] Empty project shows calm empty state (no fabricated numbers)
**Verification:** Manual with seeded sessions; aggregation test.
**Dependencies:** Task 13, Task 19's aggregation helpers may be reused — implement inline here if Task 19 not yet done
**Files:** app/projects/[id]/page.tsx (or components/projects/overview.tsx), convex/projects.ts
**Scope:** M

**Deviations:**

1. **Panel, not a route** — `components/projects/overview.tsx` renders beneath the list while a project filter is selected, so the filtered list *is* the overview's task list and the card carries only the numbers. A route would need navigation chrome the design has no slot for; deep-linking can revisit this when `/stats` lands.
2. **No new aggregation helpers from Task 19** — implemented inline in `projects.overview` (per-task index for counts/estimates, bounded owner-log scan filtered by `projectId` snapshot for focus time/leaves). Task 19 may factor a shared helper when the stats surface lands.
3. **Breaks never count** — focus time and completed leaves sum focus phases only, the same reading `todaySummary` uses, so the two can never disagree about what "focus time" means.

**Gate:** `overview` cases in `tests/projects.test.ts` (derivation incl. break exclusion, rename survival, archive survival, empty-project zeros, foreign/unauthenticated refusal) + view cases in `tests/projects-ui.test.tsx` (one-decimal hours, Archived badge, calm empty state, no-line rule).

**Checkpoint D:** project flows working. Review with human.

---

## Phase 5: Streak + Settings

### Task 15: Streak derivation + timezone tests + badge
**Description:** `lib/streak.ts`: derive current streak from session log using recorded tz offsets — earn day = ≥1 completed focus session; break = missed local calendar day; no grace. Header streak badge (fire icon, design-accurate).
**Acceptance:**
- [x] Fixture tests: 23:59 vs 00:01 edges, two offsets, gap days, no sessions
- [x] Streak never stored — recomputed (ADR-003)
**Verification:** `npm test -- streak`.
**Dependencies:** Task 8, Task 2
**Files:** lib/streak.ts, tests/streak.test.ts, components/chrome/streak-badge.tsx
**Scope:** S

### Task 16: Settings dialog + wire to timer
**Description:** shadcn dialog with durations (focus/short/long), session count N, auto-start focus/break toggles, notifications toggle; persisted to `settings`; timer engine reads settings on phase transitions.
**Acceptance:**
- [x] Changes apply to the next phase transition without reload
- [x] Defaults match PRD (25/5/15, N=4, break auto-ON, focus auto-OFF)
**Verification:** Unit test settings→engine integration; manual edit-and-run.
**Dependencies:** Task 5, Task 6, Task 3
**Files:** components/settings/*.tsx, convex/settings.ts, lib/store/timer.ts
**Scope:** M

### Task 17: Browser notifications on phase end
**Description:** Notification permission requested on first Start press (never on load); phase-end notification respecting the settings toggle; respect browser denial gracefully (in-app fallback indicator).
**Acceptance:**
- [x] No permission prompt before first Start; prompt only once
- [x] Denied permission = no crash, in-app phase-end signal still visible
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
- [x] 30-day fixture dataset matches a hand-computed oracle (PRD §10.8)
- [x] No client-side full-log scans — queries range-bounded server-side
**Verification:** Oracle test in CI.
**Dependencies:** Task 3, Task 8
**Files:** lib/aggregations.ts, convex/stats.ts, tests/aggregations.test.ts
**Scope:** M

**Gate (done 2026-10-16, merge `51440e4`):** `tests/aggregations.test.ts` (37 tests)
pins one hand-computed 30-day fixture down both paths — pure helpers and
`convex/stats.ts` (`rangeStats`/`history` over `by_owner_completed`
`[start, end)`, plus one equal-length preceding scan for trends).

### Task 20: /stats page — range selector + charts
**Description:** New route `/stats` (nav link from header): range selector, focus-time bar chart + sessions chart in hand-rolled SVG matching DESIGN.md (primary-gradient bars, no axes chrome, no lines).
**Acceptance:**
- [x] Charts render correct relative heights from fixture data (no library)
- [x] DESIGN.md no-line/palette rules hold on the page
**Verification:** Snapshot/oracle test on SVG bar heights; visual check.
**Dependencies:** Task 19, Task 2
**Files:** app/stats/page.tsx, components/stats/*.tsx
**Scope:** M

**Gate (done 2026-10-16):** bar heights asserted via `computeBarHeights` +
`data-bar-height` markup oracle; no-line/no-white asserted on rendered markup;
`/stats` prerenders static; header nav Focus↔Stats.

### Task 21: Trends + time-of-day panels
**Description:** ▲/▼ deltas vs. preceding equal-length period for each headline metric (muted styling); time-of-day distribution (hour histogram) from `startedAt` + recorded offsets.
**Acceptance:**
- [x] Deltas compare to the immediately preceding period of equal length, incl. partial custom ranges
- [x] Time-of-day buckets use each session's recorded offset (no tz guessing)
**Verification:** Unit tests with cross-timezone fixtures (PRD §10.10).
**Dependencies:** Task 20
**Files:** components/stats/trends.tsx, components/stats/time-of-day.tsx, lib/aggregations.ts
**Scope:** S

**Gate (done 2026-10-16):** deltas pinned on the oracle fixture + a mid-day
custom window; histogram pinned with three offsets converging on one local
hour; trends view renders one muted tone at every value (asserted).

### Task 22: Session history list + empty states
**Description:** Reverse-chronological session table (start, duration, phase, task, project) grouped by day; read-only; calm empty state for new users.
**Acceptance:**
- [x] Grouping respects local day at completion; archived project names still render
- [x] No edit/delete affordances (CSV is the repair path per PRD)
**Verification:** Manual with seeded multi-day data.
**Dependencies:** Task 20, Task 13
**Files:** components/stats/session-history.tsx, convex/stats.ts
**Scope:** S

**Gate (done 2026-10-16):** grouping pinned on the oracle (+120 session under
Jun 10); archived names render muted, deleted tasks keep rows but lose titles;
markup asserted free of button/a/input; empty state calm and number-free.

**Checkpoint F:** oracle + tz tests green; stats page reviewed against DESIGN.md. Human review.

---

## Phase 8: Identity, merge, CSV

### Task 23: Magic-link sign-in
**Description:** Convex Auth email magic link; `/login` route + header entry ("Sync your data"); on success, link the current anonymous identity to the user (no data moves yet).
**Acceptance:**
- [x] Anonymous identity links to user without losing existing data
- [x] Anonymous-only users never see sign-in prompts during core flows (PRD §10.1)
**Verification:** Integration test for link; manual magic-link flow.
**Dependencies:** Task 4
**Files:** convex/auth.ts, app/login/page.tsx, components/auth/account-button.tsx
**Scope:** M

**Gate (done 2026-10-16):** `viewer` query distinguishes anonymous/account;
`/login` sends Resend magic link, header shows "Sync your data" for anonymous
only (regression-safe: top-level hooks limited to the two the page tests stub);
link verified by `needsMerge`/`execute` integration tests + manual flow.
Follow-up fix shipped same day: library's default user writer dropped the
required `createdAt` on email verification — `createOrUpdateUser` callback now
stamps it (gated by `tests/auth-callback.test.ts`, 5 tests).

### Task 24: Merge-on-sign-in prompt + merge logic
**Description:** If anonymous data exists when linking, show the prompt ("We found data on this device…", default action = merge). `lib/merge.ts`: tasks union (dedupe title+createdAt), projects union (case-insensitive name, remap task `projectId`), sessions union, streak/aggregates recompute from union.
**Acceptance:**
- [x] Golden fixtures (anonymous-only, account-only, both-diverged) merge to expected states — sessions never lost or duplicated
- [x] "Use account instead" discards device data explicitly (destructive path confirmed)
**Verification:** Golden-fixture integration tests (PRD §10.4).
**Dependencies:** Task 23, Task 13
**Files:** lib/merge.ts, components/auth/merge-prompt.tsx, convex/merge.ts, tests/merge.test.ts
**Scope:** M–L — build `lib/merge.ts` + golden fixtures first (its own sitting); prompt UI + mutation wiring second. Flag for split if either half exceeds ~5 files.

**Gate (done 2026-10-16):** `tests/merge.test.ts` (18 tests): Q1–Q6 locked
rulings (task key = trimmed+folded title + UTC day; account wins; full-row
session dedupe; earliest project spelling, archived-only-if-both; sessions
remap; order-append/activeTask/settings rules) + `convex-test` integration for
`merge.execute` (union + remap + identities link), exact-dupe drop,
`discardDeviceData` hard-delete (Q10), and `importRows` unknown-reject/valid/
duplicate. Ask-first prompt renders only post-sign-in with device data.

### Task 25: CSV export + import
**Description:** Export sessions as `startedAt,completedAt,phase,task,project`; import parses/validates same schema through the same mutation path as completions (dedupe on identical rows); entry points in Settings/Stats; import feeds the merge semantics from Task 24.
**Acceptance:**
- [x] Export → import round-trip is lossless (PRD §10.5)
- [x] Malformed rows rejected with row-level errors, valid rows still importable
**Verification:** Round-trip unit test + manual import of a foreign-tool CSV.
**Dependencies:** Task 24
**Files:** lib/csv.ts, components/settings/data-io.tsx, convex/sessions.ts, tests/csv.test.ts
**Scope:** M

**Gate (done 2026-10-16):** `tests/csv.test.ts` (6 tests): 6-col format with
`tzOffsetAtCompletion` (Q7b), lossless export→import round-trip incl. quoted
commas, epoch-ms foreign timestamps, row-numbered errors, bad-header fast
fail. `DataIo` component hosts export download + import with per-row report;
unknown task/project names reject at `importRows` (Q8b, no auto-create).

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
| 9 | done | `convex/tasks.ts` + `convex/lib/order.ts` — task CRUD, the by-owner query, and fractional reordering. **The ordering decision PRD §11.4 deferred is now recorded** (under *Architecture Decisions* in `tasks/plan.md`; rationale and its limit written up in `convex/lib/order.ts`): fractional keys, not integer ranks, because ranks need a whole-list write per drag and two concurrent drags each renumber the list into a different shape — one intent lost silently. Keys stay `v.number()`: base-62 strings never exhaust, but widening `tasks.order` is a §9 ask-first schema change that wasn't asked for, so float64's ~52-splits-per-gap ceiling is accepted and `orderBetween` **throws rather than emit a duplicate** (a tie would leave the display resting on `_creationTime` forever). **Two contract bugs were caught by writing the tests, before any row existed:** `beforeId: null` meant "unbounded above afterId" — a drop at the end could land mid-list on top of an existing key, and made one end-drag's outcome depend on whether another drag had moved a row; and naming *neither* neighbour had no defined meaning at all. Both ends now anchor to the bucket's extreme, so the two orders a pair of drags can commit in settle the same way, and no-gap is a no-op (also the correct answer for dragging a lone row). Owner enforcement is uniform: every function resolves through `resolveOwner`, foreign rows answer "not found" rather than "forbidden" so no mutation can confirm the existence of someone else's ids, and `projectId` is authorized at that same choke point now rather than bolted on unchecked later (same reasoning as Task 8's `taskId`). Gate: `tests/tasks.test.ts` — **45 tests**, incl. *every other row's key is bit-identical after a drag* (the O(1) criterion, which a renumbering implementation cannot pass), two consecutive reorders, two drags issued simultaneously, the 101-row batch boundary, and the cross-tenant/refusal matrix. **Mutation-tested ×10 — every mutation killed**, including a `reorder` rewritten to renumber the whole bucket. Functions pushed to `dashing-caribou-892`. Lint/`tsc`/build/196 tests green. No browser pass (no UI in this task). |
| 10 | done | `components/tasks/*` + `lib/task-order.ts` + `app/page.tsx` — the right column is live against Convex. Presentational `TaskList`/`TaskItem`/`TaskInput` (props + callbacks, generic over `<Id extends string>` so the query's `Id<"tasks">` needs no cast) with `task-panel.tsx` as the only file that touches `convex/react`; drop algebra is pure and lives in `lib/task-order.ts`, so it is proved without a DOM (jsdom has no layout — rectangles are stubbed in the component, the *decision* is tested separately). DnD is hand-rolled HTML5 rather than a dependency, per §9's "ask first". **The browser pass found a bug that ran three tasks deep: every authenticated call in the app has been failing since Task 4.** The symptom arrived as `resolveOwner: unauthenticated callers have no owner`, which reads like a client-side race, so the first fix gated the query on the session and gated the add pill too (both kept — they are correct independently). It was neither: `signIn("anonymous")` succeeded, the token was issued, stored in the browser, and `useConvexAuth` reported `true`, and only the first call *needing* the session proved it never reached the server. Task 4 shipped `convex/auth.ts` but not `convex/auth.config.ts` — and the package's init writes both, plus a key step that sets `JWT_PRIVATE_KEY`/`JWKS`. Three symptoms in sequence (`resolveOwner` refusing → `AuthError: no providers configured` → a 1013 `AuthProviderDiscoveryFailed` reconnect loop, because `jwks.json` returned `500 Missing environment variable`) were one missing file and two missing env vars. Tasks 8 and 9 never saw it: their gates run against `convex-test`, which *is* the platform. **Also found:** `useConvexAuth` from `convex/react` reads the raw client's auth state, which `ConvexAuthProvider` never updates — it reads `false` forever while the auth-package hook reads `true` at t+5s — so the panel deliberately imports from two modules, with the reason written down so nobody tidies it back. Gate: `tests/tasks-ui.test.tsx` (38 tests). **Browser pass**, fresh context, zero console errors: input held shut at first paint then released on identity; four creates; **dragging the first row below the third lands it third**; toggle to `1 / 4`; reload persisted with the completed row correctly sunk; clear-completed 4→3; deployment left at `0 / 0`. Lint/`tsc`/build/233 tests green. |
| 11 | done | **Active-task ↔ session binding, live end-to-end.** Schema: `users.activeTaskId` (§9-approved, gated by `tests/convex-schema.test.ts`). Selection = `activeTask` query + `selectTask` mutation (click a selected row to clear; checkbox `stopPropagation`; `tabIndex` + Enter/Space + `aria-current`). Binding **captured at start**: the panel pushes `{taskId, projectId}` into the store the instant `startedAt` goes `null → number`, `complete()` logs that snapshot, and the running phase never re-reads the selection (D8). `logCompleted` now validates the bindings *before* the idempotency read (a repeat must not re-bind), tolerates a deleted task by writing the row **unbound** and repairing the pointer, and refuses a foreign task/project. `convex/lib/owner.ts` became the single home for the three ownership questions (`requireOwnedTask`/`requireOwnedProject`/`taskIfYours`). `leafCounts` derives leaves per task from `by_owner_task` + `phase === "focus"` — derived, never stored (ADR-003). **THE LIVE PASS FOUND A TIMER BUG THREE TASKS OLD:** `useCountdown` rounds *up* to the next 250 ms, so `remaining` clamped to 0 before the real clock reached `phaseEndsAt`; `usePhaseCompletion`'s dependency-gated effect asked once, was declined, and could never ask again — **the timer froze at 00:00 and no session was ever written on real time.** Fixed by making the effect deliberately un-gated (re-check every render; `completeIfDue` re-reads the clock and is idempotent), regression-tested against the old version. Gate: `tests/binding.test.ts` 21 tests + selection/derivation cases in `tests/tasks-ui.test.tsx` (incl. strengthened panel-gate tests — the generated api's property-less proxies deep-compare equal, so `toHaveBeenLastCalledWith` could not tell which query was called; all three gates are now asserted by their arguments). Mutation-tested ×2, both reverted. **Browser pass green, zero console errors, and the first successful live session write** (select A → start → click B mid-session → A 1/2, B 0/2) — closing Checkpoint B's open question. Lint/`tsc`/build/264 tests green; functions pushed to `dashing-caribou-892`. |
| 12 | done | **Progress card + Summary bento, both derived.** `progressCard` (left column, beside the timer) answers with the selected task's title/estimate/leaf count via the shared `focusLeafCount` — the same helper `leafCounts` uses, so the card's count and the bento's ratio cannot disagree; a dead or foreign `activeTaskId` is `null`, never a borrowed stranger's task. `todaySummary` (right column, under the list) sums `completedAt − startedAt` over **focus phases only** (breaks can never count) for Today's Output, and takes Focus Score's denominator from the **current board** — sessions snapshot identity, never an estimate, so an estimate can only be read off the task as it stands. Score is `null` → "—" at a zero denominator: an empty board is no score, not a score of zero. **A test caught a real arithmetic bug in the day boundary:** `startOfLocalDay` floored the raw UTC instant *then* shifted by the device offset, which names **tomorrow's** local midnight for an early-morning instant (a UTC-5 device reading 01:00Z is living in yesterday's evening) — every afternoon case passes, only the morning boundary distinguishes the two orders, and both offsets are now pinned. `useTzOffsetMinutes` supplies the offset through `useSyncExternalStore` (Next 16 rejects clock reads in client render — same rule as Task 7). The pulsing dot is tied to "something is live", not "something is selected": an empty card shows no dot, and the bento's settling state renders zeros rather than fabricating a number. Focus Score is painted `text-primary` at **every** value — the DOM test asserts the colour does not vary with the number, which is the invariant behind "no color-coded pass/fail" (a red-for-low implementation passes every other test). Gate: `tests/summary.test.ts` 13 tests (day boundary both ways, focus-only, board denominator incl. a cleared task, dead/foreign pointer, unauthenticated, recompute-not-remembered) + new view cases in `tests/tasks-ui.test.tsx`. The page-level divider test was widened to the design's **two** sanctioned bare-`border` shapes — the checkbox affordance and `code.html`'s own ghost border on the card and tiles (`outline-variant` ≤15%, "felt rather than seen"); any other colour still fails. **Browser pass green, zero console errors, Checkpoint C's loop proved live** (add → activate → focus → card 1/2 at 50%, bento 0.1 hrs / 25%, no reload). A live error the user hit — `Could not find public function for 'tasks:progressCard'` — was simply the new queries not yet pushed to `dashing-caribou-892`; resolved by `convex dev --once`. Lint/`tsc`/build/288 tests green. **Checkpoint C passed, awaiting human review.** |
| 13 | done | `convex/projects.ts` — create/rename/archive (+unarchive)/list/`overview`, 100-active cap, archive rewrites nothing (pinned by re-reading task + session after archive). Gate: `tests/projects.test.ts` (20). UI: `components/projects/{filter,picker,project-manager}.tsx` wired through panel/list/input; `tests/projects-ui.test.tsx` (24). `tsc`/lint/build green; 342 tests green. |
| 14 | done | `projects.overview` — open/done, estimated/completed leaves, focus time from the `projectId` snapshot (rename/archive-proof), calm empty state; `components/projects/overview.tsx` renders under the list while a filter is selected (panel, not a route). Same gates as 13. Checkpoint D ready for human review. |
| 15-28 | not started | |

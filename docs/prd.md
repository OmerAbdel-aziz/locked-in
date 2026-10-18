# PRD: Locked In — Deep Work Sanctuary

**Status:** Draft (pending human review)
**Date:** 2026-10-14
**Source material:** Stitch design package (`DESIGN.md`, `screen.png`, `code.html`) — frozen in [`docs/design/`](design/README.md)
**Related:** [ADR-001](decisions/ADR-001-nextjs-convex-stack.md), [ADR-002](decisions/ADR-002-anonymous-first-auth.md), [ADR-003](decisions/ADR-003-session-log-canonical.md), [ADR-004](decisions/ADR-004-two-column-dashboard-layout.md)

---

## 1. Objective

Locked In is a personal pomodoro focus app that feels like "a high-end, quiet library — low-sensory, high-intent, profoundly calm" (DESIGN.md, Creative North Star: *The Digital Sanctuary*).

**The product in one sentence:** A two-column web dashboard — a timer engine beside a task panel — where you pick a task, run focus sessions against it, watch progress accumulate as leaves, and keep an honest daily streak.

**Who it's for:** Individual knowledge workers/students who want a calm pomodoro tool. Single-user per account; no teams, no sharing.

**What success looks like:**
- A first-time user is focusing within 60 seconds of first load (no signup wall).
- The app is visually indistinguishable in spirit from the Stitch design (DESIGN.md rules are binding, not advisory).
- Timer state is accurate after tab-backgrounding, refresh, and device sleep.

## 2. Decisions log (from design review)

| # | Decision | Resolution |
|---|----------|-----------|
| D1 | Backend | **Convex** (realtime, seamless UX) |
| D2 | Auth model | **Anonymous-first**, account optional for cross-device sync |
| D3 | MVP scope | **Full feature set**: timer + tasks + session progress + streak + Focus Shroud + settings + **stats/history surface (incl. user-facing analytics: trends, time-of-day)** + **project management** (revised 2026-10-14; "analytics" clarified = user-facing, merged into stats — no third-party product telemetry) |
| D4 | Timer rules | **Classic pomodoro defaults**, user-configurable in Settings |
| D5 | Streak rule | ≥1 completed focus session earns a day; miss a local calendar day breaks it; device-local midnight; no grace period |
| D6 | Stack | **Next.js (latest, App Router) + Tailwind + HeroUI v3 + Zustand**; frontend on Vercel (Convex free tier hosts backend) — *verify Convex hosting options before deploy* |
| D6a | UI library | **HeroUI v3** replaces shadcn/ui (revised 2026-10-16). Rule: if HeroUI has the component, use it; build from scratch only where it has none. Existing components get **rewritten onto HeroUI** in a dedicated phase before Projects — the only things still built by hand are the drag-and-drop task list (HeroUI ships no DnD) and glass/gradient surface styling (CSS, not a component) |
| D6b | Themes | **Three HeroUI themes** — Mint (default, hue 155°), Airbnb (17°), Rabbit (36.66°) — each with **both light and dark mode**, switched at runtime via HeroUI's `data-theme` tokens. This **drops the fixed `#131313` canvas** in DESIGN.md — light mode is a first-class surface, not a discard. "No pure white" is **kept as a dark-mode-only rule** (DESIGN.md's "no pure white" line and fixed-`#131313` body are both marked STALE; light mode may render `oklch(100%)`/`oklch(97%)` surfaces, dark themes keep the canvas off pure white). The DOM tests that enforced the old dark-only rules are re-derived per mode. The CTA gradient becomes **theme-aware** — each theme supplies its own two-stop gradient (accent + darker sibling) at the fixed `145°` geometry, so an accent hue change retints the button with it |
| D6c | Typeface | **JetBrains Mono for everything** (revised 2026-10-16). This **supersedes the mono/Inter pairing** in `docs/design/typography.md`: there is no Inter anywhere. JetBrains Mono is already self-hosted via `next/font`; pointing `--font-sans`/`--font-mono` at it — which the three themes' own `--font-sans` tokens expect — also retints HeroUI's components to mono |
| D7 | Sign-in data merge | **Ask on sign-in** ("keep device data?"), merge is the default button; plus **CSV session import** |
| D8 | Session ↔ task binding | Session assigned to `activeTaskId` **at start**, immutable thereafter; estimate = leaf count (default 2, range 0–8) |
| D9 | Offline | **Online-only.** No outbox, no local persistence layer. Timer is client state; mutations require connectivity. **Revised 2026-10-18 (ADR-005):** the in-flight timer's *boundary instants* (`phaseEndsAt`/`startedAt`/`pausedAt` + D8 binding) are mirrored to Convex on control events (start/pause/resume/skip/reset/complete), so a reload restores the session; ticks are still never persisted and the engine stays client-side |

## 3. Assumptions

1. Web app only (no native mobile); installable/PWA behavior is out of MVP scope.
2. ~~"Project" is a plain optional string tag on a task~~ **Revised:** projects are a first-class entity with CRUD (see §4.1).
3. Design fidelity follows `DESIGN.md` tokens exactly (`#131313` + "no pure white" apply to **dark mode only** per D6b; `#4BE277` primary and "no 1px divider lines" apply to all modes). See D6a–D6c for the HeroUI / theme / typeface revisions.
4. The footer's `v2.4.1` version/uptime and `PWA INSTALLED` chrome are decorative; MVP shows real local time + real connection status only (the two-column design's footer placeholders are replaced in Task 26).
5. English-only MVP.

## 4. MVP scope

### 4.1 In scope

**Timer**
- Three phases: Focus / Short Break / Long Break (top nav tabs, as designed).
- Defaults: 25 min focus, 5 min short break, 15 min long break, 4 sessions per cycle ("Session 3 of 4").
- Cycle: sessions 1..N of N; completing session N unlocks a **long break**; counter then resets. Skip does **not** grant an early long break — it only advances to the next phase.
- Controls: Start/Pause (primary), Reset, Skip.
- Transition defaults: **focus end auto-starts break; break end waits for the user to start focus.** Both directions are Settings toggles (auto-start focus default off, auto-start break default on).
- Timing is **timestamp-anchored** (`phaseEndsAt` derived from a wall-clock instant + duration), never a decrementing counter — survives tab-backgrounding and device sleep.
- Browser Notification fired on phase end; permission requested on first Start press, never on page load. Settings toggle to disable.
- Timer runs entirely in Zustand client state; app is otherwise online-only.

**Layout** (revised 2026-10-14, see [ADR-004](decisions/ADR-004-two-column-dashboard-layout.md))
- **Two-column dashboard** is canonical: a **Timer Engine** column (left) beside an **Editorial Bento** task panel (right), over a status footer. The earlier single-column composition is discarded.
- Left column: progress ring, `Session N of M` pill, monospace digits, primary CTA, active-task card (glassmorphism).
- Right column: "Today's Focus" list with inline add input, per-task leaf counts, drag handles; then a **Summary bento**.
- Where the design and this PRD diverge, PRD functional requirements win and are expressed inside the two-column composition (ADR-004 §Consequences).

**Tasks**
- Create via inline "Add new task…" input; **project assignment (optional, from the projects picker)**; pomodoro estimate (leaf selector, 0–8, default 2).
- Reorder via drag handle (as designed).
- Complete/uncomplete via checkbox; completed tasks recede (opacity + strikethrough) per DESIGN.md.
- "Clear completed" bulk action — *not shown in the design; place beneath the task list (ADR-004).*
- Project tag rendered inline in the task row — *the design shows no tag; required here (ADR-004).*
- Summary bento: `Today's Output` (today's total focus time) and `Focus Score`.
- **Active task:** clicking a task selects it (pulsing dot + green left-border); `activeTaskId` persisted; it receives all sessions started while active.

**Session progress**
- Active-task card (left column): leaves completed vs. that task's estimate ("4 / 8 Pomodoros"), progress bar.
- Goal is a **readout only** — no celebration gate, no reward state in MVP.

**Summary bento** (right column, below the task list)
- `Today's Output`: today's total focus work, estimated vs. completed.
- `Focus Score`: **completion ratio** — completed leaves ÷ estimated leaves. Same metric as `/stats`'s completion ratio (§4.1), surfaced on the home screen (ADR-004).
- Both are **passive readouts**: no gate, no celebration, no threshold state, no color-coded pass/fail.

**Streak**
- Badge in header ("Streak: 5").
- Earn: ≥1 completed focus session that day. Break: no completed sessions for a full local calendar day. No grace period, no stored counter — **derived from session log** (ADR-003).

**Focus Shroud**
- Full-screen overlay that dims everything except the timer and active task while a focus session is running; dismissible per DESIGN.md ("Focus Shroud" component).
- The canonical two-column screen has **no shroud equivalent**; implement from the salvaged markup in `docs/design/screens/focus-shroud-snippet.html` + DESIGN.md §5 (ADR-004). Task 18 has no other source.

**Settings** (modal, HeroUI Dialog)
- Focus/short/long durations, session count N.
- Auto-start toggles (both directions).
- Notifications on/off.
- Theme is fixed dark (MVP).

**Projects** (first-class, revised D3)
- CRUD: create, rename, archive (no hard delete — archived projects keep historical session attribution; tasks of an archived project remain, tag shows muted).
- No color/icon system (DESIGN.md forbids visual noise) — projects are named tags only.
- Task ↔ project via `projectId` (nullable); unassigned tasks are allowed and shown without a tag, matching the design.
- Per-project overview: task counts (open/done), estimated vs. completed leaves, focus time (derived from session log), and a list of its tasks.
- Project selector/picker on task create/edit and a filter on the task list.
- Cap: 100 active projects per owner (generous guard against abuse, not a UX limit).

**Stats & History surface** (new route `/stats`, in MVP per revised D3 — this includes the "analytics" ask; all user-facing)
- **Range selector:** Today / 7 days / 30 days / custom.
- **Aggregations, all derived from the session log + tasks (ADR-003 — nothing precomputed):**
  - Focus time total and per-day (bar/area chart, DESIGN.md tonal style: no axes chrome, primary-gradient bars)
  - Completed focus sessions per day
  - Break time vs. focus time split
  - Per-project focus time breakdown (stacked or list)
  - Top tasks by focus time
  - Completion ratio (completed leaves vs. estimated leaves) over the range
- **Trends:** compare each metric to the immediately preceding period of equal length (▲/▼ deltas, muted styling — insight without judgment).
- **Time-of-day distribution:** which hours of the day the user focuses most (derived from `startedAt`, no timezone guessing — use recorded offsets).
- **Session history list:** reverse-chronological table of sessions (start time, duration, phase, task, project) with day grouping; sessions are read-only records (no editing/deleting individual sessions in MVP — CSV import is the repair path).
- Empty state for new users (calm, no fabricated numbers).
- Stats require the same data as everything else — no extra backend surface beyond aggregated queries.

**Identity & sync**
- Anonymous identity on first visit; app fully usable without an account.
- "Sign in / Create account" (email magic link via Convex Auth) offered as *optional* upgrade for cross-device sync.
- On sign-in with existing account: **ask** — "We found data on this device. Keep it, or use what's already in your account?" Default action = **merge**.
  - Merge: tasks unioned (dedupe by title + creation date), sessions unioned, streak/counts recomputed from the union.
- **CSV import/export of sessions** (`startedAt, completedAt, phase, task`), same format both directions; import feeds the same merge path.

### 4.2 Out of scope (v1.1+)

- ~~Stats/history surface~~ — **moved into MVP** (revised D3)
- ~~Projects management~~ — **moved into MVP** (revised D3)
- ~~User-facing analytics~~ — **merged into the stats surface** (revised D3)
- Product telemetry (third-party event tracking, funnels for *our* analytics) — no instrumentation in MVP
- Daily session *goal* as a streak metric or celebration
- Offline support of any kind (buffering, IndexedDB, read-only mode)
- Session-level editing in the history view (CSV import is the repair path)
- Per-project stats beyond the single-project overview; goals/targets per project
- PWA install, theming/light mode, i18n, social/sharing, mobile-native

## 5. UX requirements (binding from DESIGN.md)

- **No-line rule:** no 1px solid borders for sectioning; boundaries via tonal shifts + whitespace.
- **No pure white:** *dark-mode-only* (D6b — light mode may render `oklch(100%)`/`oklch(97%)` surfaces). In dark mode, text uses `on-surface` `#E5E2E1`.
- **Palette:** background + primary are **per-theme tokens** (D6b): three themes × light/dark. `#131313` / `#4BE277` are the **dark themes'** reference values; the CTA gradient is theme-aware at fixed `145°`.
- **Type:** JetBrains Mono everywhere (D6c — supersedes the Inter/Mono pairing); `tracking-tight` headlines, uppercase micro-labels.
- **Texture:** primary CTAs use the 145° `primary → primary-container` gradient; modals/drawers use glassmorphism (60% surface + 20px backdrop-blur).
- **Motion:** all transitions use `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Errors:** use `tertiary` (muted coral), never alert-red panic styling.
- Port Stitch's `tailwind.config` token set as the canonical theme.

## 6. Data model (Convex)

```
users            — (post-link) email, createdAt
identities       — anonymousId/deviceId ↔ userId link, mergedAt
projects         — ownerId, name, archivedAt?
tasks            — ownerId, title, projectId?, estimate (0-8), order,
                   completedAt?, activeFlag
sessions         — ownerId, startedAt, completedAt, phase: "focus" | "short" | "long",
                   taskId? (bound at start, immutable), projectId? (snapshot at
                   start, survives task/project changes), tzOffsetAtCompletion
settings         — ownerId, focusMin, shortMin, longMin, sessionCount,
                   autoStartBreak, autoStartFocus, notificationsEnabled
```

- **Streak, per-task leaf counts, daily aggregates, and all stats/historical aggregations are derived** from `sessions` (+ `tasks`/`projects`), never stored (ADR-003).
- `sessions.projectId` is a denormalized snapshot taken at session start so project renames/archives never rewrite history.
- "Day" grouping = calendar date at the session's recorded `tzOffsetAtCompletion` (session completing at 01:00 counts for that day, not the previous one).
- CSV import = bulk session inserts through the same validation path as normal completions.
- Merge on sign-in now also unions **projects** (deduped by name, case-insensitive; task `projectId` remaps to the surviving project).

## 7. Tech stack & structure

```
Next.js (latest, App Router) · TypeScript · Tailwind · HeroUI v3
Zustand (timer state) · Convex (backend, auth, hosting for functions)
Vercel (frontend hosting) — Convex hosting alternative: verify free tier first
```

```
app/            → routes: / (focus screen), /stats, /login callback
components/     → timer, tasks, projects, stats, shroud, settings, chrome
convex/         → schema, functions, auth
lib/            → pomodoro logic, streak derivation, aggregations, csv
docs/           → prd.md, decisions/, design/ (stitched reference)
tests/          → unit + integration
```

**Commands**

```
npm run dev        # Next dev server
npm run build      # production build
npm run lint       # eslint
npm test           # vitest
npx convex dev     # local Convex dev
npx convex deploy  # deploy backend
```

## 8. Testing strategy

- **Unit (vitest):** pomodoro cycle transitions (incl. skip/long-break rules), timestamp-anchored countdown, streak derivation across timezones/dST, merge logic (incl. project dedupe + `projectId` remap), CSV parse/serialize, stats aggregations (ranges, tz boundaries, project breakdown).
- **Integration:** Convex functions — session completion, sign-in merge, task + project CRUD under auth.
- **E2E (Playwright):** first-run → start timer → complete session → task leaves increment → streak appears; sign-in merge prompt flows; create project → assign task → stats view reflects focus time, trends and time-of-day distributions correct.
- Manual design review against DESIGN.md checklist before any release.

## 9. Boundaries

- **Always:** DESIGN.md rules are binding; streak/counts derived from session log; timer never depends on network round-trips; tests before commits.
- **Ask first:** Convex schema changes; adding a dependency; anything that touches merge semantics; changing timer transition defaults.
- **Never:** store secrets in the repo; persist timer ticks to Convex (write session **boundaries only** — the D9 control events per ADR-005, never per-tick time); build offline/queueing layers; introduce 1px divider borders.

## 10. Success criteria

1. First-run → focused session in **< 60 seconds**, zero account prompt.
2. Timer drift after 10 min backgrounded/tab-asleep: **≤ 1 second**.
3. Session completing increments exactly one task's leaf count and appears in streak derivation (verified by unit tests incl. timezone edge: 23:59 vs 00:01 local).
4. Anonymous → account merge preserves all sessions and tasks from both sides (integration test with fixture datasets).
5. CSV export → re-import is lossless (round-trip test).
6. Design review: every DESIGN.md "Do/Don't" passes on the shipped screen.
7. `npm run build` + `npm test` green on main.
8. Stats page totals for a 30-day fixture dataset match a hand-computed oracle (per-day, per-project, completion ratio) including timezone edges.
9. Project archive never mutates historical sessions: archived project still appears in past stats with correct attribution; tasks keep their tag (muted).
10. Stats trends/time-of-day panels match hand-computed values on a cross-timezone fixture dataset.

## 11. Open questions

1. **Convex frontend hosting free tier** — verify current offering before choosing Vercel vs Convex (D6, blocking only at deploy time).
2. Notification support/sound on mobile browsers — likely degrade gracefully, confirm scope for v1.1.
3. Magic-link delivery limits for anonymous users who later "lose" the device — document recovery expectations.
4. Drag-reorder persistence ordering scheme (fractional index vs. integer ranks) — decide at schema time.
5. **Stats charting library** — hand-rolled SVG (full design control, DESIGN.md-compatible) vs. Recharts/Nivo (faster, heavier, fights the no-line aesthetic). Lean hand-rolled SVG for the chart types we need.

## 12. Risks

| Risk | Mitigation |
|------|-----------|
| Design fidelity drifts from Stitch package | `code.html` kept in `docs/design/` as reference; DESIGN.md checklist in PR review |
| Anonymous data loss scares users ("clearing browser = lost streak") | Prominent optional account nudge once streak ≥ 3; CSV export always available |
| Merge semantics wrong → data loss on sign-in | ADR-003 makes sessions canonical; golden-fixture integration tests |
| Timer accuracy regressions | Timestamp-anchored rule encoded in unit tests; never allow counter-based timer in review |
| Scope creep (stats/projects added post-grilling) | Features are now spec'd in §4.1 with hard caps; anything beyond them goes through the PRD's out-of-scope list first |
| Stats page slow over large session histories | Convex aggregation queries with range-bounded indexes on `completedAt`; no client-side full-log scans |

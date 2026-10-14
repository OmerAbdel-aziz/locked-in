# Locked In — Stitch Design Package

Frozen reference copy of the Stitch design project this app is built against.
Everything here is **reference material, not source**: the real app lives in `app/`,
`components/`, and `lib/`. These files exist so Tasks 2, 7, 18, and 26 have a stable,
offline copy to check against.

## Canonical layout: two-column dashboard

**Decision (2026-10-14, human):** the two-column dashboard is the canonical layout.
Recorded in [ADR-004](../decisions/ADR-004-two-column-dashboard-layout.md).

The earlier single-column composition that was briefly frozen here has been discarded.
Its only unique asset — the Focus Shroud markup — was salvaged into
`screens/focus-shroud-snippet.html` before removal.

## Provenance

| | |
|---|---|
| Stitch project | **Locked In Dashboard UI** — `14098409106330604275` |
| Canonical screen | *Locked In: Paused (Desktop)* — `617a18b476fc4f29974c4d8a43461277`, 2560×2048 |
| Exported | 2026-10-14 |
| Exported via | `stitch get project` / `stitch get screen` (CLI v0.11.1) |
| Screens in project | 4 (2 distinct compositions — see below) |

## Contents

| File | What it is |
|---|---|
| `DESIGN.md` | The design system document ("The Digital Sanctuary"). Binding rules for the build. |
| `code.html` | **Canonical screen** — the two-column dashboard. Self-contained: Tailwind CDN + `<script id="tailwind-config">` carrying the full token set, Inter + JetBrains Mono + Material Symbols. |
| `screen.png` | Screenshot of the canonical screen. Visual diff target for Tasks 7 and 26. |
| `tokens.json` | The `tailwind.config.theme.extend` block extracted to JSON — colors, borderRadius, fontFamily — plus the DESIGN.md rules. **Input for Task 2.** |
| `screens/running-mobile.{html,png}` | *Locked In: Running (Mobile)*, 780×2542. Responsive reference. |
| `screens/focus-shroud-snippet.html` | The Focus Shroud overlay markup, salvaged from the discarded layout. **Input for Task 18.** |

## The two-column composition

```
┌──────────────────────────────────────────────────────────────┐
│ Locked In    Focus · Short Break · Long Break    Streak: 5   │  TopNavBar
├───────────────────────────┬──────────────────────────────────┤
│  (timer ring)             │  Today's Focus        3/8 DONE   │
│  Session 3 of 4           │  ┌ Add new task...           ┐   │
│  25:00                    │  │ ✓ Finalize Q2 pitch deck 4/8│  │
│                           │  │ ✓ Morning inbox zero    1/1│  │
│  [ Start Focus Session ]  │  │   Review arch diagrams 0/2│  │  Right column:
│  ◐ Currently Active       │  │   Weekly 1:1 Design     0/1│  │  Editorial Bento
│  Finalize Q2 pitch deck   │  └───────────────────────────┘   │
│  Progress  4/8 Pomodoros  │  TODAY'S OUTPUT   FOCUS SCORE    │
│  ▓▓▓▓▓▓░░░░░░             │  4.2 hrs           92%           │
├───────────────────────────┴──────────────────────────────────┤
│ Locked In Status: Ready        Local Time: 14:00             │  Footer
└──────────────────────────────────────────────────────────────┘
```

- **Left — Timer Engine:** progress ring, `Session N of M` pill, monospace digits,
  primary CTA, active-task card (glassmorphism, pulsing dot, progress bar).
- **Right — Task Management:** "Today's Focus" list with inline add input, per-task
  leaf counts, drag handles, completed styling; then a **Summary bento**.
- **Footer:** status + real local time. See "decorative chrome" below.

## Token set — verified

All four exported screens carry an **identical 47-color token set**, matching the
project's `designTheme.namedColors` exactly — no missing keys, no value mismatches.
The tokens are layout-independent, so the set is valid regardless of which composition
is canonical. Task 2 has one unambiguous source of truth.

Spot-checks (per `tasks/todo.md` Task 2 acceptance):

- `bg-surface-container-low` → `#1c1b1b`
- `text-primary` → `#4be277`
- `on-surface` → `#e5e2e1`
- `background` / `surface` → `#131313`
- No `#ffffff` anywhere in the palette — pure white is forbidden by DESIGN.md.

Non-color tokens: `borderRadius` (`DEFAULT 0.25rem`, `lg 0.5rem`, `xl 0.75rem`,
`full 9999px`) and `fontFamily` (`headline/body/label: Inter`, `mono: JetBrains Mono`).

## Where the design is silent or conflicts with the PRD

The PRD is the product spec; the design is the visual spec. Four places they diverge.
All resolved in favour of keeping the PRD's *requirements* while adopting the design's
*composition* — see ADR-004 for each.

| Gap | Resolution |
|---|---|
| **Focus Score / Today's Output** | Both map onto aggregations the PRD already requires. Output = today's total focus time (replaces the single-column footer's `Total today:` aggregate). Focus Score = completion ratio (completed ÷ estimated leaves), which PRD §4.1 already mandates on `/stats`. Surfaced on the home screen as a **passive readout** — no gate, no celebration — preserving §4.1's "no reward state". |
| **No project tags** | The design's task rows carry no project tag, but PRD §4.1 requires optional project assignment + picker + filter. Render the tag inline in the row. Design is simply silent here. |
| **No "Clear completed"** | Required by PRD §4.1 as a bulk action. The design omits it. Place it beneath the task list. |
| **Footer "PWA INSTALLED"** | Decorative chrome. PRD assumption 1 puts PWA out of scope and assumption 4 requires *real* local time + *real* connection status. Task 26 replaces it. |

## Rules that constrain the build

From `DESIGN.md` §2–§6; binding, not advisory (PRD §5):

- **No pure white.** Text is `on-surface` `#e5e2e1`.
- **No-line rule.** No 1px solid borders for sectioning — tonal shifts and whitespace
  only. No `<hr>` or `border-b` in task lists.
- **Body background** `#131313`.
- **CTA texture:** 145° gradient `primary → primary-container`, never flat fill.
- **Glassmorphism:** `surface` @ 60% + 20px backdrop-blur for modals/drawers.
- **Ambient shadow:** `0 20px 50px -12px rgba(0,0,0,0.5)`.
- **Easing:** all transitions `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Errors:** use `tertiary` (muted coral), never alert-red panic styling.
- **Editorial bento:** the right column is a tonal/whitespace composition, not a card
  grid — respect the no-line rule when building it.

## Re-exporting

```
stitch get project 14098409106330604275 --json          # designTheme.designMd
stitch find screens --project 14098409106330604275 --json
stitch get screen 617a18b476fc4f29974c4d8a43461277 --project 14098409106330604275 --json
```

`htmlCode` and `screenshot` are returned as signed download URLs, not inline — fetch
them with a plain HTTP GET. Set `STITCH_API_KEY` (from `opencode.json`) first.

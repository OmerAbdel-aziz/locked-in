# Locked In — Stitch Design Package

Frozen reference copy of the Stitch design project that this app is built against.
Everything in this directory is **reference material, not source**: the real app lives
in `app/`, `components/`, and `lib/`. These files exist so Tasks 2, 7, 18, and 26 have
a stable, offline copy to check against.

## Provenance

| | |
|---|---|
| Stitch project | **Locked In Dashboard UI** — `14098409106330604275` |
| Exported | 2026-10-14 |
| Exported via | `stitch get project` / `stitch get screen` (CLI v0.11.1) |
| Screens in project | 4 |

The project is public and unchanged upstream; re-exporting will reproduce this package.

## Contents

| File | What it is |
|---|---|
| `DESIGN.md` | The design system document ("The Digital Sanctuary"). Binding rules for the build. |
| `code.html` | **Canonical screen** — *Locked In: Running (Desktop)*, 1280×1024. Self-contained: Tailwind CDN + `<script id="tailwind-config">` with the full token set, Inter + JetBrains Mono + Material Symbols. |
| `screen.png` | Screenshot of the canonical screen. Used for visual diff in Tasks 7 and 26. |
| `tokens.json` | The `tailwind.config.theme.extend` block extracted to JSON — colors, borderRadius, fontFamily — plus the DESIGN.md rules in machine-readable form. **This is the input for Task 2.** |
| `screens/paused-desktop.{html,png}` | *Locked In: Paused (Desktop)*, 2560×2048. Reference only — see the discrepancy below. |
| `screens/running-mobile.{html,png}` | *Locked In: Running (Mobile)*, 780×2542. Reference only. |

The second *Running (Desktop)* screen (2560×2722, id `faadb360…`) is byte-identical in
HTML to `code.html`; only its canvas size and screenshot differ, so it is not duplicated
here. `screen.png` is taken from that screen because the 1280×1024 instance has no
screenshot in the Stitch project.

## Token set — verified

All four exported screens carry an **identical 47-color token set**, and that set matches
the project's `designTheme.namedColors` exactly — no mismatches, no missing keys. Task 2
therefore has one unambiguous source of truth.

Spot-checks (per `tasks/todo.md` Task 2 acceptance):

- `bg-surface-container-low` → `#1c1b1b`
- `text-primary` → `#4be277`
- `on-surface` → `#e5e2e1`
- `background` / `surface` → `#131313`
- No `#ffffff` anywhere in the palette — pure white is forbidden by DESIGN.md.

Non-color tokens: `borderRadius` (`DEFAULT 0.25rem`, `lg 0.5rem`, `xl 0.75rem`,
`full 9999px`) and `fontFamily` (`headline/body/label: Inter`, `mono: JetBrains Mono`).

## ⚠️ Discrepancy: two different layouts

The four screens are **not** four states of one layout. They are two unrelated
compositions:

**A. `code.html` — single column.** Timer ring → controls → active-task card → task
list → footer. This matches the PRD exactly (§4.1 Timer, Tasks, Session progress, the
`Total today: N estimated • M completed` footer, and a hidden *Focus Shroud* state that
Task 18 can crib from). **This is the canonical layout.**

**B. `screens/paused-desktop.html` — two column.** A "Timer Engine" column beside a
"Today's Focus" panel, plus a "Summary / Mini Stats Bento" showing **`TODAY'S OUTPUT
4.2 HRS`** and **`FOCUS SCORE 92%`**.

Screen B conflicts with the PRD in two places:

1. The PRD specifies a single-screen app (§1), not a two-column dashboard.
2. "Focus score" is a judgment metric. The PRD calls trends "insight without judgment"
   (§4.1) and states the goal is "a **readout only** — no celebration gate, no reward
   state in MVP" (§4.1 Session progress).

Treat B as exploratory. **Follow A.** If B was meant to supersede A, that is a PRD
change and needs a human decision before any code is written against it.

## Rules that constrain the build

Pulled from `DESIGN.md` §2–§6; these are binding, not advisory (PRD §5):

- **No pure white.** Text is `on-surface` `#e5e2e1`.
- **No-line rule.** No 1px solid borders for sectioning — tonal shifts and whitespace
  only. No `<hr>` or `border-b` in task lists.
- **Body background** `#131313`.
- **CTA texture:** 145° gradient `primary → primary-container`, never flat fill.
- **Glassmorphism:** `surface` @ 60% + 20px backdrop-blur for modals/drawers.
- **Ambient shadow:** `0 20px 50px -12px rgba(0,0,0,0.5)`.
- **Easing:** all transitions `cubic-bezier(0.4, 0, 0.2, 1)`.
- **Errors:** use `tertiary` (muted coral), never alert-red panic styling.

## Re-exporting

```
stitch get project 14098409106330604275 --json          # designTheme.designMd
stitch find screens --project 14098409106330604275 --json
stitch get screen <screen-id> --project 14098409106330604275 --json
```

`htmlCode` and `screenshot` are returned as signed download URLs, not inline — fetch
them with a plain HTTP GET. Set `STITCH_API_KEY` (from `opencode.json`) first.

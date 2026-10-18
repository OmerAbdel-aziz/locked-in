# ADR-006: The /stats surface and today-donut are rebuilt on Arc UI components

## Status
Accepted

## Date
2026-10-18

## Context
PRD OQ5 leaned *"hand-rolled SVG for the chart types we need"* — full design
control, no dependency. Tasks 19–22 shipped exactly that: every chart, list
and empty state on `/stats` was hand-built. It worked, but the cost was
structural and kept compounding:

- **Interaction depth.** Scrub-to-read, keyboard scrubbing, morphing bars
  and donut rings on range change, digit-roll counters — each is weeks of
  work to make correct, accessible and reduced-motion aware, and the
  hand-rolled versions had none of them.
- **Accessibility surface.** Hand-rolled SVG renders nothing a screen
  reader can read without a parallel hidden table; that table then becomes
  a second thing to keep in sync (and was).
- **Test the surface, not the pixels.** The old "no `<line>` elements in a
  hand-rolled SVG" gate tested our drawing code against itself. The
  oracle's value moved to data-flow assertions that survive a UI rewrite.

[Arc](https://uiarc.dev) is a component collection with the right
aesthetics for this app: tonal surfaces, no 1px divider borders, muted
chrome, motion as a *readout* (springs, digit rolls) rather than decoration
— the same taste DESIGN.md encodes. It ships the exact set we hand-rolled:
bar charts with scrub-to-read, donut charts, an activity heatmap, animated
counters, sparklines, segmented controls, a sortable data table, a
timeline, and an empty state.

The trigger was the home screen's Summary bento gaining a **per-project
donut** for today — a new hand-rolled chart for the fourth time on a single
page component, which is the moment a shared library pays for itself.

## Decision
**Rebuild the `/stats` panel and the bento donut on Arc UI components**
(`/components/arc/*`, installed from `https://uiarc.dev/r/*`), keeping the
app's tonal card shells, the aggregation math (`lib/aggregations.ts`),
and every Convex query boundary unchanged.

1. **Theming via a CSS bridge, never by editing Arc source.** Arc ships
   `foundation.css` with its own `--surface-* / --text-* / --accent-* /
   --font-* / --radius-*` token names. `app/globals.css` imports
   `foundation.css` *before* the theme blocks (so every theme tie wins by
   import order) and carries one bridge block re-pointing the Arc tokens at
   the app's current token names (`--surface-raised` → `--surface-secondary`,
   `--accent-strong` → `--cta-to`, both `--font-*` → `--font-jetbrains`,
   radii at the app's `--radius` scale, etc.). Arc's `data-theme="dark"`
   hooks never collide with the app's ten `data-theme` values. Retiring
   Arc or re-pointing is then a block delete, and Arc's source stays
   pristine for upgrades.
   - Chart colors: flat accent tones only — per-project slices hash their
     key through `seriesColorFor()` into `var(--series-1..4)`. Gradients
     are retired on stats (the last gradient-bearing surface); the CTA
     button keeps its theme-aware gradient (D6b).
2. **A11y contract replaces pixel assertions.** Each view is verified
   (static markup) on Arc's exposed surface: the sr-only captions
   (`"{label}, {period}"`), the hidden data-table rows, legend
   `"Work, 125 min"` labels, `aria-sort` on the default-sorted column, and
   `aria-pressed` on the range presets. The "no `<line>` elements" gate is
   retired with the hand-rolled SVG.
3. **Motion on stats only.** Arc's motion ships where it is content
   (scrubbing, counter rolls, morphs). The home screen is untouched — its
   surfaces (bento text, timer) keep their existing contract.
4. **Timezone rules survive the rewrite unchanged** (ADR-003 / PRD D5):
   history rows are pre-shifted into their recorded
   `tzOffsetAtCompletion` and handed to Arc's Timeline with
   `timeZone="UTC"`, so the recorded local day and `HH:MM` wall time are
   exact and identical on server and client — no ICU trust. Arc's date
   formatting is bypassed anywhere it would touch a clock (`formatDayKey`
   / `formatLocalTime` / `periodLabel`).
5. **Where Arc is not used, the reason is on the record:** heading cards
   use Arc's `AnimatedCounter` inside the app's shell but not Arc's
   `MetricCard` (1px border + sign-colored delta violate DESIGN.md); the
   custom date inputs stay native `<input type="date">` (Arc's pickers
   reformat calendar days by the *runtime's* zone); Arc's `Card` and grid
   primitives are passed over for the app's quiet shell (`rounded-2xl
   bg-surface-container-low/30`, a surface every Arc tile sits inside).
6. **The bento donut** (`convex/tasks.ts` `todaySummary`) returns a
   `perProject` split — the same `perProjectBreakdown` over the same
   bounded today scan plus a name-only bounded read (`PROJECTS_CAP = 500`,
   mirroring `stats.ts`) — so the home screen shows *today's* focus
   distribution with a stable color per project key, a "No project" slice,
   and an automatic "Other" bucket below the group threshold.
7. **The heatmap** counts focus minutes per local day over a *fixed
   trailing 365 days* (its own bounded `rangeStats` call; deliberately
   independent of the range selector) and doubles as the analysis page's
   calendar picker: clicking a day sets a single-day custom range.

## Alternatives considered
- **Keep hand-rolling a fourth chart.** Cons: another no-interaction,
  no-hidden-table SVG; the per-project slice colors would be invented
  *again*, untested. Rejected — this is the compounding cost the ADR
  exists to stop.
- **Recharts/Nivo.** Cons: canvas-heavy defaults, giant dependency, and
  their aesthetics fight DESIGN.md (the original OQ5 rejection still
  holds). Rejected — Arc wins on both axes vs OQ5's losers.
- **Adopt Arc wholesale later for the whole app.** Cons: HeroUI already
  covers the app's chrome (D6a), and Arc's strengths are data displays.
  Deferred — this ADR scopes Arc to the analysis surfaces.
- **Store `perProject` in the bento read from `stats.rangeStats`.**
  Cons: `todaySummary` must not depend on a named range, and today is the
  one window the home screen wants at `Date.now()` with no arguments.
  Rejected — the split rides the query that already scans today.

## Consequences
- `components/arc/*` is a vendored, near-black-box surface: pinned by
  contract tests, never edited (fixes happen in the bridge or by re-pulling
  a newer Arc release).
- `components/stats/breakdown.tsx` (the old PerProjectView/TopTasksView)
  is deleted; `lib/aggregations.ts` is untouched, and
  `computeBarHeights` becomes test-only (still the scaling oracle).
- The old OQ5 "hand-rolled SVG" lean is **resolved against itself** — the
  options were written before Arc's aesthetics and contract-with-tests
  made the tradeoff disappear; OQ5 is closed as "Arc UI on the analysis
  surfaces" (2026-10-18).
- New dependency surface: `motion` (already a dependency) powers Arc's
  springs; `@uiarc/*` components are vendored files, not a runtime dep.
- A fifth visual system (HeroUI, app CSS, native buttons, Arc) joins the
  repo — acceptable because each owns clean layers: HeroUI = app chrome,
  Arc = data displays, app CSS = shells + tokens, native = timezone-shaped
  inputs.

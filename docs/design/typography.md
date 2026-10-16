# Typography — Locked In

**Status:** current (revised 2026-10-16, Phase 3.5a, PRD D6c)

## Rule

**JetBrains Mono for everything.** There is no Inter anywhere in the app.

This supersedes the mono/Inter pairing DESIGN.md §3 described (Inter for UI,
JetBrains Mono for timer digits and status chrome). The pairing is kept in the
frozen design package as history; it is not the product's typeface.

## How it lands

- Self-hosted via `next/font` in `app/layout.tsx` (`--font-jetbrains`,
  weights 400/500/700 — 400 added because body copy now sets in Mono).
- Every font token in `app/globals.css` (`--font-sans`, `--font-mono`,
  `--font-headline`, `--font-body`, `--font-label`) resolves at
  `var(--font-jetbrains)`.
- The three HeroUI themes' own `--font-sans` tokens reference
  `var(--font-inter)`, which no longer exists; a post-theme override block
  repoints `--font-sans`/`--font-mono` at JetBrains Mono so HeroUI components
  render mono as well.
- Token repoint only: no font was added, none removed from the loader except
  the Inter import itself.

## Why Mono everywhere

The timer digits were already Mono ("the interface's heartbeat"); extending
it to the whole UI keeps one voice across the sanctuary rather than two. The
tabular figures also keep the countdown, leaf counts, and stats columns
aligned without extra `tabular-nums` plumbing.

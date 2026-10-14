# ADR-001: Next.js + Convex stack, Vercel frontend hosting

## Status
Accepted

## Date
2026-10-14

## Context
Locked In is a greenfield single-screen personal focus app. We need persistence, auth (anonymous-first with optional account), and a home for the frontend. The user wants "seamless UX" — realtime reactivity without hand-rolled sync — and chose Convex for its backend as a service.

## Decision
- **Backend:** Convex (database, functions, Convex Auth).
- **Frontend:** Next.js (latest, App Router) + TypeScript + Tailwind + shadcn/ui, despite the app being effectively one screen.
- **Timer state:** Zustand, fully client-side.
- **Hosting:** Vercel (frontend) + Convex free tier (backend), pending verification that Convex's own frontend hosting doesn't fit (static-only).

## Alternatives Considered

### Vite + React SPA
- Pros: Faster startup, less config, no SSR baggage for a non-SEO'd personal tool.
- Cons: Rejected — the user explicitly prefers Next.js for future route growth (marketing pages, `/login` callback handling).
- Rejected by user preference (D6).

### Local-first (IndexedDB + sync engine)
- Pros: Native offline reliability.
- Cons: Much larger build; conflicts with the decision to make the app online-only (D9).
- Rejected.

### Zustand over Redux / React Context
- Timer is high-frequency ephemeral state; Zustand's selector model avoids re-render storms with minimal ceremony. Context would re-render the tree on every tick.

## Consequences
- Auth, queries, and mutations require connectivity (accepted, D9).
- Realtime reactivity for free if multi-device sync is later enabled.
- Must verify Convex free-tier limits before launch; Vercel hobby tier is sufficient for the frontend.
- Next.js SSR must never be used for timer state (client-only).

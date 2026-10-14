# ADR-002: Anonymous-first auth with merge-on-sign-in

## Status
Accepted

## Date
2026-10-14

## Context
The product must get a user focusing within 60 seconds of first load — a signup wall destroys that. But cross-device sync (the reason Convex was chosen) requires an account. We also don't want two divergent identities silently losing data when a user finally signs in.

## Decision
1. **Anonymous-first:** every visitor gets an anonymous identity; the full product works without an account.
2. **Optional upgrade:** email magic link (Convex Auth) offered as "sync your data," never required for core use.
3. **Merge-on-sign-in:** when signing into an account while anonymous data exists on the device, **ask the user** — "We found data on this device. Keep it, or use what's already in your account?" — with **merge as the default action**.
   - Projects: union, deduped by name (case-insensitive); task `projectId` remaps to the surviving project.
   - Tasks: union, deduped by title + creation date.
   - Sessions: union (see ADR-003 — streak derives from the union).
4. **CSV session import** feeds the same merge path, as a manual escape hatch and migration tool.

## Alternatives Considered

### Silent automatic merge
- Pros: Zero friction.
- Cons: No user visibility into what happens to the two datasets; irreversible if wrong.
- Rejected: option 2 gives the user control at the single moment it matters.

### Account data always wins (replace)
- Pros: Simplest.
- Cons: Destroys weeks of anonymous usage — data loss.
- Rejected.

### No anonymous accounts; require login
- Pros: Single identity, no merge code ever.
- Cons: Signup wall on first visit; violates the <60s-to-focus success criterion.
- Rejected.

### Anonymous-only, no sync ever
- Cons: Forfeits Convex's main benefit; streak lost when browser data is cleared, with no recourse.
- Rejected.

## Consequences
- Anonymous data is device-bound and lost if browser storage is cleared — communicated to the user via the account-nudge (streak ≥ 3) and CSV export.
- Merge logic is a correctness-critical subsystem: golden-fixture integration tests required (PRD §10.4).
- Two identity paths (`identities` link table) complicate every Convex function's authorization — always resolve owner through the link.

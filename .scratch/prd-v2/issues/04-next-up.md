# 04: Next-up + soft order surfaces

**What to build:** The roadmap's advisory engine: per-Roadmap **Next-up** (first incomplete unit in roadmap order — computed, never stored) surfaces on the home spine and roadmap affordances, with a one-click "confirm & bind" straight into the timer. Marked-known units and completed units are excluded from Next-up; nothing is gated or locked anywhere (Q13). Ordering already exists from 02 — this makes it legible.

**Blocked by:** 02 — Roadmap spine.

**Status:** ready-for-agent

- [ ] Next-up pointer cost is additive (derived at read time per ADR-003 discipline; no stored pointer of truth).
- [ ] Confirm-next-up produces exactly the same bound-session path as 03's manual binding.
- [ ] Completing / marking-known / reordering all immediately advance Next-up correctly in tests (incl. edge: everything complete / started-from-zero) — freerobotics' "start at month N" effect with zero assessment machinery.

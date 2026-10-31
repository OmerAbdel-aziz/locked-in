# 11: Social — Followers + Shareable signals

**What to build:** The accountability slice, in the consented shape settled at C1-C4: per-Template (or per-Roadmap) follower requests, approve/deny by the owner, and approved followers seeing **only** the Shareable signals — percent-done, streak, focus hours on that roadmap. Nothing else is visible by construction: no profiles, feeds, likes, dashboards, leaderboards. Visibility is schema-level owner resolution, not UI hiding.

**Blocked by:** 10 — Social: publish Templates and fork.

**Status:** ready-for-agent

- [ ] Follower request → approve/deny flow works; approval gates constitute the entire share surface (denied by default).
- [ ] Verified schema-level restriction: followers can resolve only % / streak / hours on that one roadmap — enforced, and asserted by test, not by component behaviour.
- [ ] Unfollow/unapprove removes visibility immediately.
- [ ] A hostile-follower test suite proves every other dimension is unreachable through the public surfaces.

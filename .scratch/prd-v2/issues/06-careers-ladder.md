# 06: Career Ladder + Careers page

**What to build:** The pull side, vertical and demoable: a Roadmap can carry a user-authored **Career Ladder** — ordered bottom-up **Rungs**, each with title, optional company, optional pay range, requirement bullets, degree-mention status, side-door flag (entry route vs target role), and milestone links ("on the path"). A top-level **Careers** page joins the nav (Focus / Careers / Stats / Settings) listing every rung across roadmaps; rung CRUD is available nowhere else. Sanctuary design rules apply to the new page. No curated content, no analytics, no readiness engine (Q14, C1, C2).

**Blocked by:** 02 — Roadmap spine.

**Status:** ready-for-agent

- [ ] Rung CRUD processes via the app's function seams with owner resolution reused at the choke point; careers page renders rungs bottom-up across roadmaps.
- [ ] Milestone links only accept milestones of the parent roadmap; dangling links are impossible by construction.
- [ ] Pay/degree/side-door fields render when present and degrade to lean rungs without them (C5 optional set).
- [ ] Playwright covers the ladder walkthrough; design-rule DOM gates apply on the Careers page.

# 05: Vocabulary contract — Roadmap / Unit rename completes

**What to build:** The *contract* half of the expand done in 01: once every call site has been migrated in batches and call sites read naturally as Roadmap/Unit everywhere, the old "Project/Task" forms are retired — labels in UI, table/function/component names, settings copy, CSV headers (exported names move to the new vocabulary; importers still accept both). Schema/function renames ship when their blast radius is at zero-cost.

**Blocked by:** 02 · 03 · 04 (all batches done; contract can land green only here).

**Status:** ready-for-agent

- [ ] Golden migration test re-runs green after the contract lands (identical aggregates via the same user-visible queries).
- [ ] No user-facing surface says "project/task" anymore; glossary vocabulary is the snake everywhere (D-2).
- [ ] CSV export writes new names, and import accepts both (merge compatibility held).
- [ ] All suites/typecheck/lint stay green; the migration is captured as an ADR per PRD-v2's further-notes.

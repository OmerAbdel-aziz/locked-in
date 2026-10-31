# Locked In

A deep-work pomodoro engine for people executing learning roadmaps. Learners are first-class citizens: the product's job is to turn a chosen path (built, imported, or borrowed) into focused, measurable progress without breaking the calm.

## Learning model

**Roadmap**:
A user-owned ordered learning path, composed of Milestones containing Units. The successor concept to the old "Project". _Avoid_: Project, plan, track

**Milestone**:
A named grouping of Units inside a Roadmap, typically corresponding to a phase, month, or section. Carries the Roadmap's soft order.

**Unit**:
The checkable leaf of a Roadmap — the smallest thing a learner can do, complete, and bind focus sessions to. May carry a time estimate. The renamed successor of the old "Task". _Avoid_: Task, item, node

**Plan**:
A single weekly focus-hour target a learner sets per Roadmap, against which actual effort is reconciled.

**Pace**:
The reconciliation of logged focus hours against the Plan for a Roadmap. Renders as on track / at risk / stalled.

**Next-up**:
The app-determined suggested Unit of a Roadmap: the first incomplete Unit in the Roadmap's order. Advisory only; no gating.

**Soft order**:
The rule that a Roadmap's ordering is advisory: Units can be completed in any order, while the app always surfaces Next-up.

## Sharing

**Template**:
A Roadmap a learner has published for others to copy (fork) into their own private world. Progress on a Template copy stays private to the forker.

**Fork**:
A learner's private copy of a Template or an imported Roadmap, fully independent of the source afterwards.

**Follower**:
A learner a publishing learner has approved to see that Roadmap's shareable signals (percent done, streak, focus hours). _Avoid_: Friend, connection

**Shareable signals**:
The limited set of data visible to Followers: percentage complete, streak, and logged focus hours. Nothing else is social in v1.

## Careers

**Career Ladder**:
A user-authored set of ordered job **Rungs** attached to a Roadmap, representing the jobs the path is expected to lead to. Travels with the Roadmap when published and forked.

**Rung**:
One target or entry job in a Career Ladder: title, optional company, optional pay range, requirement bullets, degree-mention status, and links to the Milestones it draws on. _Avoid_: rung choice, step

## Carried-over terms

**Session**:
An append-only, immutable log entry recording one completed pomodoro phase, optionally bound to a Unit at start. The canonical record; every aggregate derives from it at read time.

**Sanctuary**:
The frozen visual/interaction identity of the app: low-sensory, dark, mono, no-1px-dividers. Roadmaps live inside it, not instead of it.

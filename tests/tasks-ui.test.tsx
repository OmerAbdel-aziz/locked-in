import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ProgressCardView,
  type ProgressCardData,
} from "@/components/tasks/progress-card";
import { TaskList, type TaskRow } from "@/components/tasks/task-list";
import { DEFAULT_ESTIMATE } from "@/components/tasks/task-input";
import { TaskPanel, toTaskRows } from "@/components/tasks/task-panel";
import {
  SummaryBentoView,
  type SummaryData,
} from "@/components/tasks/summary-bento";
import { dropNeighbours } from "@/lib/task-order";

/*
 * react-aria (via HeroUI Select) reads `<meta name=...>` through
 * `CSS.escape` when a popover opens (its CSP-nonce lookup), and jsdom
 * implements no `CSS` global at all — the popover crashed with
 * "Cannot read properties of undefined (reading 'escape')". The escape
 * only shapes a selector string; the plain identity stub is faithful.
 */
if (typeof globalThis.CSS === "undefined") {
  globalThis.CSS = { escape: (value: string) => value } as typeof CSS;
}

/**
 * Task 10 gate: the "Today's Focus" panel.
 *
 * Three of the acceptance lines are visual or live, and are split by where
 * they can actually be proved:
 *
 *   - **"Create/complete/reorder work against live Convex queries"** is the
 *     browser run-through, because jsdom has no Convex and a mocked provider
 *     would only prove the mock. What is proved *here* is every input to that
 *     run: which mutation each gesture should produce, in what arguments, and
 *     that `toTaskRows` hands the list what the query returned.
 *   - **"No 1px divider borders used anywhere in the list"** is an assertion
 *     on the rendered class soup — the rule is about which classes exist, so
 *     that is exactly where it can break.
 *   - The drag algebra is proved separately from the drag *plumbing*,
 *     deliberately: jsdom has no layout, so anything computed from element
 *     rectangles there is fiction. The rectangles stay in the component
 *     (stubbed below so the half-drop has a real edge), the decision lives in
 *     `lib/task-order.ts` and is tested without a DOM at all.
 */

const TASKS: TaskRow<string>[] = [
  { id: "a", title: "Draft the outline", estimate: 4, done: false, completedLeaves: 0, isActive: true, projectName: null },
  { id: "b", title: "Review pull requests", estimate: 2, done: false, completedLeaves: 1, isActive: false, projectName: null },
  { id: "c", title: "Weekly 1:1 notes", estimate: 2, done: false, completedLeaves: 0, isActive: false, projectName: null },
  { id: "d", title: "Morning inbox zero", estimate: 1, done: true, completedLeaves: 1, isActive: false, projectName: null },
];

function row(partial: Partial<TaskRow<string>> & { id: string; title: string }): TaskRow<string> {
  return {
    estimate: 2,
    done: false,
    completedLeaves: 0,
    isActive: false,
    projectName: null,
    ...partial,
  };
}

function renderList(tasks: TaskRow<string>[]) {
  const onCreate = vi.fn();
  const onToggle = vi.fn();
  const onReorder = vi.fn();
  const onClearCompleted = vi.fn();
  const onSelect = vi.fn();

  const view = render(
    <TaskList
      tasks={tasks}
      onCreate={onCreate}
      onToggle={onToggle}
      onReorder={onReorder}
      onClearCompleted={onClearCompleted}
      onSelect={onSelect}
    />,
  );

  return { ...view, onCreate, onToggle, onReorder, onClearCompleted, onSelect };
}

/**
 * The row element for a task, addressed by its `data-task-id` or, more
 * readably, by its title.
 */
function rowFor(idOrTitle: string): HTMLElement {
  const byId = document.querySelector(
    `[data-task-id="${idOrTitle}"]`,
  );
  if (byId instanceof HTMLElement) {
    return byId;
  }

  const item = screen
    .getByText(idOrTitle)
    .closest<HTMLElement>("[role='listitem']");
  if (item === null) {
    throw new Error(`no list row contains "${idOrTitle}"`);
  }
  return item;
}

/**
 * jsdom has no layout, so every `getBoundingClientRect()` is a zero box and
 * "the top half" and "the bottom half" would be the same point. Giving the
 * row a real box makes the half a drop lands on a decision with an edge to
 * test, rather than an accident of `0 < 0`.
 */
function box(element: HTMLElement, top = 0, height = 40): void {
  element.getBoundingClientRect = () => ({
    top,
    left: 0,
    right: 300,
    bottom: top + height,
    width: 300,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
}

/**
 * Drag events, dispatched as real `MouseEvent`s.
 *
 * `fireEvent.dragOver(...)` would construct a `DragEvent`, which jsdom does
 * not implement — the fallback drops `clientY` from the initialiser, which is
 * the one field the row's half-test reads. Building the event by hand keeps
 * the coordinate, and going through `fireEvent` keeps React's `act` wrapper.
 */
function drag(
  element: HTMLElement,
  type: "dragstart" | "dragover" | "dragend" | "drop",
  init: MouseEventInit = {},
): void {
  fireEvent(
    element,
    new MouseEvent(type, { bubbles: true, cancelable: true, ...init }),
  );
}

/** Drag `dragged` onto `target`, landing in the given half of its box. */
function dropOn(dragged: string, target: string, half: "top" | "bottom"): void {
  const destination = rowFor(target);
  box(destination, 0, 40);
  drag(rowFor(dragged), "dragstart");
  drag(destination, "dragover", { clientY: half === "top" ? 5 : 35 });
  drag(destination, "drop");
}

function allClasses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("*")).flatMap((element) =>
    Array.from(element.classList),
  );
}

afterEach(cleanup);

describe("dropNeighbours", () => {
  it("places a drop above the first row at the front", () => {
    expect(dropNeighbours(["a", "b", "c"], "c", "a", "above")).toEqual({
      afterId: null,
      beforeId: "a",
    });
  });

  it("places a drop below the last row at the back", () => {
    expect(dropNeighbours(["a", "b", "c"], "a", "c", "below")).toEqual({
      afterId: "c",
      beforeId: null,
    });
  });

  it("names both neighbours for a drop in the middle", () => {
    expect(dropNeighbours(["a", "b", "c", "d"], "a", "c", "below")).toEqual({
      afterId: "c",
      beforeId: "d",
    });
  });

  it("measures the gap with the dragged row removed", () => {
    // `b` dropped above `c` sits exactly where it already is. With `b` left
    // in the list the pair would read { afterId: "b" } — the row as its own
    // predecessor, which `reorder` rejects outright.
    expect(dropNeighbours(["a", "b", "c"], "b", "c", "above")).toEqual({
      afterId: "a",
      beforeId: "c",
    });
  });

  it("names no gap when a row is dropped on itself", () => {
    expect(dropNeighbours(["a", "b"], "a", "a", "below")).toEqual({
      afterId: null,
      beforeId: null,
    });
  });

  it("names no gap when it is the only row there is", () => {
    expect(dropNeighbours(["a"], "a", "a", "above")).toEqual({
      afterId: null,
      beforeId: null,
    });
    expect(dropNeighbours([], "a", "b", "below")).toEqual({
      afterId: null,
      beforeId: null,
    });
  });
});

describe("the list renders in display order", () => {
  it("shows open rows first, then finished ones", () => {
    renderList(TASKS);

    const ids = screen
      .getAllByRole("listitem")
      .map((element) => element.getAttribute("data-task-id"));
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps a finished row behind the open ones it is not interleaved with", () => {
    renderList([TASKS[3], TASKS[0], TASKS[1], TASKS[2]]);

    const ids = screen
      .getAllByRole("listitem")
      .map((element) => element.getAttribute("data-task-id"));
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("counts finished against total in the header", () => {
    renderList(TASKS);
    expect(screen.getByText("1 / 4 COMPLETED")).toBeTruthy();
  });

  it("shows each task's leaves as recorded over its estimate", () => {
    renderList(TASKS);
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getByText("0/4")).toBeTruthy();
  });
});

describe("adding a task", () => {
  it("submits a trimmed title with the default estimate", () => {
    const { onCreate } = renderList([]);

    fireEvent.change(screen.getByLabelText("New task title"), {
      target: { value: "   Ship the thing   " },
    });
    fireEvent.submit(screen.getByLabelText("New task title").closest("form")!);

    expect(onCreate).toHaveBeenCalledTimes(1);
    // Third argument is the picked project: absent while the Task 13 picker
    // offers nothing, travelling as "no argument" (unassigned).
    expect(onCreate).toHaveBeenCalledWith("Ship the thing", DEFAULT_ESTIMATE, undefined);
    expect(DEFAULT_ESTIMATE).toBe(2);
  });

  it("submits the estimate the leaf selector was turned to", async () => {
    const { onCreate } = renderList([]);

    // Phase 9: the leaf selector is a HeroUI Select — open the trigger,
    // then pick the row from the listbox. The trigger's accessible name is
    // the composed [label, value] ("Leaves 2" → "Leaves 6"), so match by
    // the stable label part.
    fireEvent.click(screen.getByRole("button", { name: /Leaves/ }));
    fireEvent.click(await screen.findByRole("option", { name: "6" }));
    fireEvent.change(screen.getByLabelText("New task title"), {
      target: { value: "Long thing" },
    });
    fireEvent.submit(screen.getByLabelText("New task title").closest("form")!);

    expect(onCreate).toHaveBeenCalledWith("Long thing", 6, undefined);
  });

  it.each(["", "     "])("submits nothing for the blank title %j", (title) => {
    const { onCreate } = renderList([]);

    fireEvent.change(screen.getByLabelText("New task title"), {
      target: { value: title },
    });
    fireEvent.submit(screen.getByLabelText("New task title").closest("form")!);

    expect(onCreate).not.toHaveBeenCalled();
  });

  /**
   * A task typed before the anonymous identity exists has no owner to be
   * created under and the server refuses it — which the browser pass proved
   * by typing into a fresh context and watching the write be rejected. The
   * pill says so plainly rather than accepting the text and losing it.
   */
  it("is held shut until there is an identity to create under", () => {
    const onCreate = vi.fn();
    render(
      <TaskList
        tasks={[]}
        onCreate={onCreate}
        onToggle={vi.fn()}
        onReorder={vi.fn()}
        onClearCompleted={vi.fn()}
        onSelect={vi.fn()}
        ready={false}
      />,
    );

    const input = screen.getByLabelText("New task title");
    expect(input).toHaveProperty("disabled", true);
    // Phase 9: the leaf selector is a HeroUI Select — react-aria marks the
    // disabled state on the Select's root (`data-disabled`), keeps the
    // trigger focusable for screen readers, and must refuse to open the
    // listbox while the identity settles.
    const leafTrigger = screen.getByRole("button", { name: /Leaves/ });
    expect(leafTrigger.closest("[data-disabled]")).not.toBeNull();
    fireEvent.click(leafTrigger);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.change(input, { target: { value: "Too early" } });
    fireEvent.submit(input.closest("form")!);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("empties the field for the next entry", () => {
    renderList([]);
    const input = screen.getByLabelText("New task title");

    fireEvent.change(input, { target: { value: "First" } });
    fireEvent.submit(input.closest("form")!);

    expect(screen.getByLabelText("New task title")).toHaveProperty(
      "value",
      "",
    );
  });
});

describe("toggling completion", () => {
  it("completes an open task", () => {
    const { onToggle } = renderList(TASKS);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Complete Draft the outline" }),
    );

    expect(onToggle).toHaveBeenCalledWith("a", true);
  });

  it("reopens a finished one", () => {
    const { onToggle } = renderList(TASKS);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Uncomplete Morning inbox zero" }),
    );

    expect(onToggle).toHaveBeenCalledWith("d", false);
  });

  it("does not also select the task it completed", () => {
    // One control, one job. Ticking the active task would otherwise drag the
    // selection onto whatever was just finished — the running session's
    // binding would follow it on the next start, silently.
    const { onToggle, onSelect } = renderList(TASKS);

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Complete Draft the outline" }),
    );

    expect(onToggle).toHaveBeenCalledWith("a", true);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("selecting a task (PRD §4.1)", () => {
  it("selects a row when it is clicked anywhere but the checkbox", () => {
    const { onSelect } = renderList(TASKS);

    fireEvent.click(rowFor("Draft the outline"));

    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("selects a finished row too", () => {
    // PRD §4.1 makes the selection about which task receives *sessions*, so
    // a completed row is selectable — the rail marks the choice, not whether
    // there is work left in it.
    const { onSelect } = renderList(TASKS);

    fireEvent.click(rowFor("Morning inbox zero"));

    expect(onSelect).toHaveBeenCalledWith("d");
  });

  it("selects a row from the keyboard as well as the mouse", () => {
    const { onSelect } = renderList(TASKS);

    fireEvent.keyDown(rowFor("Draft the outline"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("a");

    fireEvent.keyDown(rowFor("Weekly 1:1 notes"), { key: " " });
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("keeps a keypress meant for the checkbox from selecting the row", () => {
    // Enter activates a focused button — but the keydown still reaches the
    // row above it. Without the target guard, every completion would also
    // move the selection to the task it just ticked.
    const { onSelect } = renderList(TASKS);

    fireEvent.keyDown(
      screen.getByRole("checkbox", { name: "Complete Draft the outline" }),
      { key: "Enter" },
    );

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reports the selected row to assistive tech, and only that row", () => {
    renderList(
      TASKS.map((t) => ({ ...t, isActive: t.id === "c" })),
    );

    // `aria-current` rather than `aria-selected`, which is legal only inside
    // a listbox the design never asked to become.
    expect(rowFor("c").getAttribute("aria-current")).toBe("true");
    expect(rowFor("a").hasAttribute("aria-current")).toBe(false);
    expect(rowFor("d").hasAttribute("aria-current")).toBe(false);
  });
});

describe("dragging a row", () => {
  it("drops it above the first row, naming only what follows", () => {
    const { onReorder } = renderList(TASKS);

    dropOn("c", "a", "top");

    expect(onReorder).toHaveBeenCalledWith("c", null, "a");
  });

  it("drops it below the last row, naming only what precedes", () => {
    const { onReorder } = renderList(TASKS);

    dropOn("a", "c", "bottom");

    expect(onReorder).toHaveBeenCalledWith("a", "c", null);
  });

  it("drops it between two rows, naming both", () => {
    const { onReorder } = renderList(TASKS);

    dropOn("a", "b", "bottom");

    expect(onReorder).toHaveBeenCalledWith("a", "b", "c");
  });

  it("does nothing when a row is dropped on itself", () => {
    const { onReorder } = renderList(TASKS);

    dropOn("a", "a", "bottom");

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("does nothing when no gap was ever hovered", () => {
    const { onReorder } = renderList(TASKS);

    drag(rowFor("Draft the outline"), "dragstart");
    drag(rowFor("Draft the outline"), "drop");

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("treats a pass over the finished rows as the end of the open list", () => {
    const { onReorder } = renderList(TASKS);

    // Finished rows are not somewhere a row can be reordered — Task 9
    // refuses across that boundary — so a drop on one lands past the last
    // open task instead of being dropped on the floor.
    dropOn("a", "Morning inbox zero", "top");

    expect(onReorder).toHaveBeenCalledWith("a", "c", null);
  });

  it("makes open rows draggable and finished ones not", () => {
    renderList(TASKS);

    expect(rowFor("Draft the outline").draggable).toBe(true);
    expect(rowFor("Morning inbox zero").draggable).toBe(false);
  });
});

describe("clear completed", () => {
  it("sits beneath the list and runs the bulk clear", () => {
    const { onClearCompleted } = renderList(TASKS);

    const list = screen.getByRole("list");
    const button = screen.getByRole("button", { name: "Clear completed" });

    // "Beneath the list" is a DOM-order claim, not a pixel one — that is the
    // part a future refactor is most likely to move.
    expect(list.compareDocumentPosition(button)).toBeTruthy();
    expect(
      list.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(button);
    expect(onClearCompleted).toHaveBeenCalledTimes(1);
  });

  it("is present but inert when nothing is finished", () => {
    const { onClearCompleted } = renderList([TASKS[0]]);

    const button = screen.getByRole("button", { name: "Clear completed" });
    expect(button).toBeTruthy();
    expect(button).toHaveProperty("disabled", true);

    fireEvent.click(button);
    expect(onClearCompleted).not.toHaveBeenCalled();
  });
});

describe("the empty list (audit 2026-10-16)", () => {
  it("guides a first-time visitor instead of showing a void", () => {
    renderList([]);

    expect(
      screen.getByText(/add your first above to start collecting leaves/),
    ).toBeTruthy();
  });

  it("leaves with the first task", () => {
    renderList(TASKS);

    expect(
      screen.queryByText(/add your first above to start collecting leaves/),
    ).toBeNull();
  });
});

describe("the row's design details", () => {
  it("dims a finished row and strikes its title through", () => {
    renderList(TASKS);

    expect(rowFor("Morning inbox zero").className).toContain("opacity-40");
    expect(screen.getByText("Morning inbox zero").className).toContain(
      "line-through",
    );
    expect(rowFor("Draft the outline").className).not.toContain("opacity-40");
  });

  it("marks the active row with the design's green rail", () => {
    renderList(TASKS);

    expect(rowFor("Draft the outline").className).toContain(
      "border-l-2 border-primary",
    );
    expect(rowFor("Review pull requests").className).not.toContain(
      "border-l-2",
    );
  });

  it("renders a project tag inline when a task has a project", () => {
    renderList([
      row({ id: "a", title: "Roadmap", projectName: "Ship Q2" }),
      row({ id: "b", title: "Untagged" }),
    ]);

    const tag = screen.getByText("Ship Q2");
    // Inline means *in the row*, beside the title — not its own column, which
    // the composition has no room for (PRD §4.1, ADR-004).
    expect(tag.closest("[role='listitem']")).toBe(
      screen.getByText("Roadmap").closest("[role='listitem']"),
    );

    const untagged = rowFor("Untagged");
    expect(untagged.querySelector('[class*="tracking-wider"]')).toBeNull();
  });
});

describe("toTaskRows", () => {
  it("derives done from activeFlag and defaults the two facts the queries supply", () => {
    const rows = toTaskRows({
      active: [{ _id: "a", title: "open", estimate: 2, activeFlag: true }],
      completed: [{ _id: "b", title: "finished", estimate: 1, activeFlag: false }],
    });

    expect(rows).toEqual([
      // No options means "nothing selected, no sessions yet, and no project
      // names yet", which is exactly what the panel shows while the queries
      // settle — an honest default, not a placeholder for a value on its way.
      { id: "a", title: "open", estimate: 2, done: false, completedLeaves: 0, isActive: false, projectId: null, projectName: null, projectArchived: false },
      { id: "b", title: "finished", estimate: 1, done: true, completedLeaves: 0, isActive: false, projectId: null, projectName: null, projectArchived: false },
    ]);
  });

  it("marks the selected row and reads its leaves from the queries' answers", () => {
    // What the panel passes once `activeTask` and `leafCounts` have
    // returned: the selection by id, and counts keyed by the same id.
    const rows = toTaskRows(
      {
        active: [{ _id: "a", title: "open", estimate: 2, activeFlag: true }],
        completed: [{ _id: "b", title: "finished", estimate: 1, activeFlag: false }],
      },
      { activeTaskId: "b", leaves: { a: 1, b: 4 } },
    );

    expect(rows.map((r) => ({ id: r.id, isActive: r.isActive, leaves: r.completedLeaves }))).toEqual([
      // A finished task can be the selected one and keep its leaves: PRD
      // §4.1 selects, it does not filter, and 4/1 is a real answer (a task
      // over-delivered past its estimate).
      { id: "a", isActive: false, leaves: 1 },
      { id: "b", isActive: true, leaves: 4 },
    ]);
  });

  it("treats an unknown selection id as no selection at all", () => {
    // The shape for a pointer whose target is not in the list — a task
    // deleted between the two queries — so no row draws a rail it cannot
    // back with a real selection.
    const rows = toTaskRows(
      { active: [{ _id: "a", title: "open", estimate: 2, activeFlag: true }], completed: [] },
      { activeTaskId: "gone", leaves: { a: 2 } },
    );

    expect(rows[0].isActive).toBe(false);
    expect(rows[0].completedLeaves).toBe(2);
  });

  it("hands the panel an empty list while the query is still settling", () => {
    // The shape `TaskPanel` renders for `useQuery(...) === undefined`, so the
    // header does not read "1 / 1" for a task that never existed.
    expect(
      toTaskRows({ active: [], completed: [] }),
    ).toEqual([]);
  });
});

describe("the active-task card (PRD §4.1 'Session progress')", () => {
  const card: ProgressCardData = {
    taskId: "a",
    title: "Draft the outline",
    estimate: 8,
    leaves: 4,
  };

  it("shows the selected task's title, leaves and estimate", () => {
    render(<ProgressCardView data={card} />);

    expect(screen.getByText("Draft the outline")).toBeTruthy();
    // The design's own wording, "4 / 8 Pomodoros" — leaves against the
    // estimate, which is the acceptance criterion in the card's own words.
    expect(screen.getByText(/4 \/ 8 Pomodoros/)).toBeTruthy();
    expect(screen.getByText("Currently Active")).toBeTruthy();
  });

  it("fills the bar by the ratio, and never past the end", () => {
    const { container } = render(<ProgressCardView data={card} />);
    const bar = container.querySelector(
      '[style*="width"]',
    ) as unknown as HTMLElement;

    expect(bar.style.width).toBe("50%");

    // A task may outrun its estimate — a finished task keeps receiving
    // focus time until another is selected — and the bar's own extent may
    // not, or the track would be overrun by the thing it measures.
    cleanup();
    const { container: over } = render(
      <ProgressCardView data={{ ...card, leaves: 5, estimate: 2 }} />,
    );
    const overBar = over.querySelector(
      '[style*="width"]',
    ) as unknown as HTMLElement;
    expect(overBar.style.width).toBe("100%");
    // The text still tells the truth about the overrun: 5 of 2 is real.
    expect(screen.getByText(/5 \/ 2 Pomodoros/)).toBeTruthy();
  });

  it("fills nothing for a task with no estimate to be against", () => {
    const { container } = render(
      <ProgressCardView data={{ ...card, leaves: 3, estimate: 0 }} />,
    );
    const bar = container.querySelector(
      '[style*="width"]',
    ) as unknown as HTMLElement;

    // "3 / 0 Pomodoros" is an honest answer to a task the user chose to
    // leave unestimated; a 100%-full bar would be a celebration of it.
    expect(screen.getByText(/3 \/ 0 Pomodoros/)).toBeTruthy();
    expect(bar.style.width).toBe("0%");
  });

  it("says nothing is selected instead of inventing a card", () => {
    const { container } = render(<ProgressCardView data={null} />);

    expect(screen.getByText("Nothing selected yet")).toBeTruthy();
    expect(screen.queryByText(/Pomodoros/)).toBeNull();
    // No bar and no title — the two things a fabricated card would have to
    // make up. And the dot stops pulsing: nothing is live.
    expect(container.querySelector('[style*="width"]')).toBeNull();
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("is the design's glass card, not a bordered box", () => {
    const { container } = render(<ProgressCardView data={card} />);

    // `glass-panel` is DESIGN.md §2's "Glass & Gradient" rule: surface at
    // 60% with a 20px backdrop blur, for things that float.
    expect(container.querySelector(".glass-panel")).toBeTruthy();

    // The one border it carries is the design's own ghost border —
    // `outline-variant` at 10%, "felt rather than seen" (DESIGN.md §4) —
    // around a single card, never a line sectioning the page off.
    const classes = allClasses(container);
    expect(
      classes.filter((name) => /^border-(t|b|x|y)(-|$)/.test(name)),
    ).toEqual([]);
    expect(classes.some((name) => /^border-/.test(name))).toBe(true);
  });
});

describe("the Summary bento (PRD §4.1 'Summary bento')", () => {
  const summary: SummaryData = {
    focusMinutes: 125,
    completedLeaves: 2,
    estimatedLeaves: 3,
  };

  it("reports today's focus time in hours, to one decimal", () => {
    render(<SummaryBentoView summary={summary} />);

    // 125 minutes is 2.08 hours — the design's "4.2 hrs" shape, so the
    // readout never pretends to a precision the sessions do not have.
    expect(screen.getByText("2.1")).toBeTruthy();
    expect(screen.getByText("hrs")).toBeTruthy();
  });

  it("rounds the completion ratio to a whole percent", () => {
    render(<SummaryBentoView summary={summary} />);

    // 2 of 3 is 66.7% — rounded, because "66.67%" is precision the count
    // of sessions cannot carry.
    expect(screen.getByText("67%")).toBeTruthy();
  });

  it("reports no ratio at all when there is no estimate to divide by", () => {
    render(
      <SummaryBentoView
        summary={{ focusMinutes: 50, completedLeaves: 2, estimatedLeaves: 0 }}
      />,
    );

    // "0%" would read as a failure of a question nobody asked: an empty
    // board is not a score of zero, it is no score (PRD §4.1 — passive
    // readout, no threshold state).
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("is calm for a brand-new account — no fabricated numbers", () => {
    render(
      <SummaryBentoView
        summary={{ focusMinutes: 0, completedLeaves: 0, estimatedLeaves: 0 }}
      />,
    );

    expect(screen.getByText("0.0")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("never grades the number it is showing", () => {
    // PRD §4.1's "no color-coded pass/fail", asserted as the invariant that
    // actually matters: the score's colour does not vary with its value. A
    // red-for-low implementation passes every other test in this file.
    const { container: empty } = render(
      <SummaryBentoView
        summary={{ focusMinutes: 0, completedLeaves: 0, estimatedLeaves: 0 }}
      />,
    );
    const { container: full } = render(
      <SummaryBentoView
        summary={{ focusMinutes: 600, completedLeaves: 10, estimatedLeaves: 10 }}
      />,
    );

    const scoreClass = (container: HTMLElement) =>
      [...container.querySelectorAll("p")]
        .find((p) => p.className.includes("text-primary"))?.className ?? "";

    // One green at "—" and the same green at "100%": the design's own
    // markup paints it `primary` at every value, and that constancy is the
    // whole claim.
    expect(scoreClass(empty)).toBe(scoreClass(full));
    expect(scoreClass(full)).toContain("text-primary");
  });

  it("sections with tonal shifts, never a divider line", () => {
    const { container } = render(<SummaryBentoView summary={summary} />);
    const classes = allClasses(container);

    expect(
      classes.filter((name) => /^border-(t|b|x|y)(-|$)/.test(name)),
    ).toEqual([]);
    expect(classes.filter((name) => name.startsWith("divide-"))).toEqual([]);
    expect(container.querySelector("hr")).toBeNull();
  });
});

describe("DESIGN.md's binding rules hold in the rendered output", () => {
  function expectNoForbiddenChrome(html: string) {
    // No pure white (DESIGN.md §5) — the whole palette avoids it.
    expect(html).not.toMatch(/#f{3,6}\b/i);
    expect(html).not.toMatch(/\b(text|bg|border|fill|stroke)-white\b/);
  }

  it("uses no pure white in the list", () => {
    const { container } = renderList(TASKS);
    expectNoForbiddenChrome(container.innerHTML);
  });

  it("sections with tonal shifts, never a divider line", () => {
    const { container } = renderList(TASKS);
    const classes = allClasses(container);

    // Horizontal separators at any width, vertical rails at 1px, and the
    // row-gap utility — none of them are how this design divides space.
    expect(classes.filter((name) => /^border-(t|b|x|y)(-|$)/.test(name))).toEqual([]);
    expect(classes.filter((name) => /^border-[lr]$/.test(name))).toEqual([]);
    expect(classes.filter((name) => name.startsWith("divide-"))).toEqual([]);
    expect(container.querySelector("hr")).toBeNull();
  });

  it("reserves a bare 1px border for interactive affordances", () => {
    const { container } = renderList(TASKS);

    // DESIGN.md §5: "A 1px solid border is reserved for interactive
    // affordances such as inputs." In this panel that is the checkboxes —
    // HeroUI's `checkbox__control` (Phase 3.5d; the design's own markup drew
    // them with `border border-outline-variant`) — and nothing else may use
    // one.
    const bareBorders = Array.from(container.querySelectorAll("*")).filter(
      (element) => element.classList.contains("border"),
    );
    const notAffordances = bareBorders.filter(
      (element) =>
        element.getAttribute("role") !== "checkbox" &&
        !element.classList.contains("checkbox__control"),
    );

    expect(notAffordances.map((element) => element.outerHTML.slice(0, 80))).toEqual([]);
    expect(bareBorders.length).toBeGreaterThan(0);
  });
});

describe("the panel module", () => {
  it("is imported by the page rather than inlined", () => {
    // A guard against the demo list quietly coming back: `page.tsx` must
    // reach for the panel, and the panel is the only thing that may talk to
    // `convex/react`.
    expect(TaskPanel).toBeTypeOf("function");
  });
});

/**
 * The one behaviour that only the running app exposed: a first-time visitor
 * reaches the page *before* their anonymous identity exists, and the server
 * refused the subscription outright (`resolveOwner: unauthenticated callers
 * have no owner`). Invisible in a browser once an identity is stored — which
 * is every run after the first — so it is pinned here instead.
 *
 * `convex/react` is mocked for the whole file, which is safe because nothing
 * else under test talks to it; `TaskList` is pure props.
 */
const { gate } = vi.hoisted(() => ({ gate: { authenticated: true } }));

vi.mock("convex/react", () => ({
  useQuery: vi.fn(() => undefined),
  useMutation: () => vi.fn(() => Promise.resolve()),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: gate.authenticated,
    isLoading: !gate.authenticated,
  }),
}));

describe("the panel waits for an identity", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear();
  });

  afterEach(() => {
    gate.authenticated = true;
  });

  it("holds every subscription back while there is no owner to resolve", () => {
    gate.authenticated = false;

    render(<TaskPanel />);

    // All five, not "the last one": every query this panel makes resolves
    // an owner, so all five must be gated together. Asserting on the
    // *arguments* rather than on `toHaveBeenLastCalledWith(...)` is the point
    // — the generated api hands back property-less proxies, so two different
    // queries deep-compare equal and an assertion naming one of them passes
    // no matter which one was actually called. A new owner-derived query that
    // forgot the gate fails this line by changing the array's length.
    expect(vi.mocked(useQuery).mock.calls.map(([, args]) => args)).toEqual([
      "skip",
      "skip",
      "skip",
      "skip",
      "skip",
    ]);
  });

  it("subscribes normally once the session is established", () => {
    gate.authenticated = true;

    render(<TaskPanel />);

    expect(vi.mocked(useQuery).mock.calls.map(([, args]) => args)).toEqual([
      {},
      {},
      {},
      {},
      {},
    ]);
  });
});


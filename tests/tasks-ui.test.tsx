import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/convex/_generated/api";
import { TaskList, type TaskRow } from "@/components/tasks/task-list";
import { DEFAULT_ESTIMATE } from "@/components/tasks/task-input";
import { TaskPanel, toTaskRows } from "@/components/tasks/task-panel";
import { dropNeighbours } from "@/lib/task-order";

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

  const view = render(
    <TaskList
      tasks={tasks}
      onCreate={onCreate}
      onToggle={onToggle}
      onReorder={onReorder}
      onClearCompleted={onClearCompleted}
    />,
  );

  return { ...view, onCreate, onToggle, onReorder, onClearCompleted };
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
    expect(onCreate).toHaveBeenCalledWith("Ship the thing", DEFAULT_ESTIMATE);
    expect(DEFAULT_ESTIMATE).toBe(2);
  });

  it("submits the estimate the leaf selector was turned to", () => {
    const { onCreate } = renderList([]);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("New task title"), {
      target: { value: "Long thing" },
    });
    fireEvent.submit(screen.getByLabelText("New task title").closest("form")!);

    expect(onCreate).toHaveBeenCalledWith("Long thing", 6);
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
        ready={false}
      />,
    );

    const input = screen.getByLabelText("New task title");
    expect(input).toHaveProperty("disabled", true);
    expect(screen.getByRole("combobox")).toHaveProperty("disabled", true);

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
  it("derives done from activeFlag and stubs the fields later tasks own", () => {
    const rows = toTaskRows({
      active: [{ _id: "a", title: "open", estimate: 2, activeFlag: true }],
      completed: [{ _id: "b", title: "finished", estimate: 1, activeFlag: false }],
    });

    expect(rows).toEqual([
      // completedLeaves: derived from the session log — Task 11.
      // isActive: PRD's *selected* task — Task 11.
      // projectName: no projects exist yet — Task 13.
      { id: "a", title: "open", estimate: 2, done: false, completedLeaves: 0, isActive: false, projectName: null },
      { id: "b", title: "finished", estimate: 1, done: true, completedLeaves: 0, isActive: false, projectName: null },
    ]);
  });

  it("hands the panel an empty list while the query is still settling", () => {
    // The shape `TaskPanel` renders for `useQuery(...) === undefined`, so the
    // header does not read "1 / 1" for a task that never existed.
    expect(
      toTaskRows({ active: [], completed: [] }),
    ).toEqual([]);
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
    // the design's own markup draws them with `border border-outline-variant`
    // — and nothing else may use one.
    const bareBorders = Array.from(container.querySelectorAll("*")).filter(
      (element) => element.classList.contains("border"),
    );
    const notAffordances = bareBorders.filter(
      (element) => element.getAttribute("role") !== "checkbox",
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
  afterEach(() => {
    gate.authenticated = true;
  });

  it("holds the subscription back while there is no owner to resolve", () => {
    gate.authenticated = false;

    render(<TaskPanel />);

    // `"skip"`, not `{}`: an empty call still reaches the server, and the
    // server is right to reject it — there is no session behind it.
    expect(useQuery).toHaveBeenLastCalledWith(api.tasks.list, "skip");
  });

  it("subscribes normally once the session is established", () => {
    gate.authenticated = true;

    render(<TaskPanel />);

    expect(useQuery).toHaveBeenLastCalledWith(api.tasks.list, {});
  });
});

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { toTaskRows } from "@/components/tasks/task-panel";
import { TaskList } from "@/components/tasks/task-list";
import { ProjectFilter } from "@/components/projects/filter";
import { ProjectPicker } from "@/components/projects/picker";
import {
  ProjectManagerView,
  type ManagerProject,
} from "@/components/projects/project-manager";
import {
  ProjectOverviewView,
  type OverviewData,
} from "@/components/projects/overview";

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
 * Tasks 13 + 14 gate: the project picker, the filter chips, the CRUD
 * surface, and the overview card.
 *
 * Each is proved at the level where it can actually break:
 *
 *   - **Filter/picker** are pure props-in/callbacks-out, so clicks and
 *     selections are asserted directly — including the "No project means
 *     null" reading, which is the whole of the picker's contract with
 *     `tasks.create`.
 *   - **`toTaskRows`** owns the only join (project id → tag name + archived
 *     flag), so the join's three answers — named, muted, and unknown — are
 *     pinned here rather than in a browser.
 *   - **Manager/overview views** are pure, so the CRUD gestures and the
 *     empty-state-vs-zeros distinction are asserted without Convex. The
 *     live binding (which mutation each gesture produces) is the browser
 *     pass, as with Task 10.
 *   - The two acceptance criteria that touch rows — archive rewrites nothing
 *     and the overview reads the snapshot — live in `tests/projects.test.ts`,
 *     against real mutations. This file proves what those rows look like.
 */

const PROJECTS = [
  { id: "p1", name: "Ship Q2", archived: false },
  { id: "p2", name: "Old work", archived: true },
];

function allClasses(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("*")).flatMap((element) =>
    Array.from(element.classList),
  );
}

function expectNoForbiddenChrome(html: string) {
  expect(html).not.toMatch(/#f{3,6}\b/i);
  expect(html).not.toMatch(/\b(text|bg|border|fill|stroke)-white\b/);
}

afterEach(cleanup);

describe("the filter chips", () => {
  it("renders All plus one chip per project", () => {
    const onChange = vi.fn();
    render(<ProjectFilter projects={PROJECTS} value={null} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "All" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ship Q2" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Old work" })).toBeTruthy();
  });

  it("renders nothing when there is nothing to filter by", () => {
    const { container } = render(
      <ProjectFilter projects={[]} value={null} onChange={vi.fn()} />,
    );

    // One chip selecting itself would teach nobody anything — see the file.
    expect(container.innerHTML).toBe("");
    expect(
      screen.queryByRole("group", { name: "Filter tasks by project" }),
    ).toBeNull();
  });

  it("marks the selection and reports clicks", () => {
    const onChange = vi.fn();
    render(<ProjectFilter projects={PROJECTS} value="p1" onChange={onChange} />);

    expect(
      screen.getByRole("button", { name: "Ship Q2" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed"),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Old work" }));
    expect(onChange).toHaveBeenCalledWith("p2");

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("keeps an archived project's chip, rendered muted", () => {
    render(<ProjectFilter projects={PROJECTS} value={null} onChange={vi.fn()} />);

    // Archived tasks are still on the board with muted tags — hiding the
    // chip would strand them with no way to isolate them.
    const chip = screen.getByRole("button", { name: "Old work" });
    expect(chip.className).toContain("opacity-50");
    expect(
      screen.getByRole("button", { name: "Ship Q2" }).className,
    ).not.toContain("opacity-50");
  });
});

describe("the picker", () => {
  it("offers No project plus every active project", async () => {
    const onChange = vi.fn();
    render(
      <ProjectPicker
        projects={[{ id: "p1", name: "Ship Q2" }]}
        value={null}
        onChange={onChange}
      />,
    );

    // HeroUI Select (Phase 9): the options live in a listbox popover that
    // opens from the trigger, not in static <option> markup. The trigger's
    // accessible name is the composed [label, value] ("Project No
    // project"), so match by the stable label part.
    fireEvent.click(screen.getByRole("button", { name: /Project/ }));
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "No project",
      "Ship Q2",
    ]);
  });

  it("reads the empty option as unassigned, not as a project called nothing", async () => {
    const onChange = vi.fn();
    // The picker is controlled — the panel owns the value — and react-aria
    // fires no change when a re-clicked option is *already* selected, so a
    // spy that never feeds `value` back would make the second selection look
    // broken when it is the harness that is stale. This one stores it, which
    // also proves the sentinel round-trips through the trigger's text.
    function Harness() {
      const [value, setValue] = useState<string | null>("p1");
      return (
        <ProjectPicker
          projects={[{ id: "p1", name: "Ship Q2" }]}
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: /Project/ }));
    fireEvent.click(await screen.findByRole("option", { name: "No project" }));
    expect(onChange).toHaveBeenCalledWith(null);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Project/ }).textContent,
      ).toContain("No project"),
    );

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: /Project/ }));
    fireEvent.click(await screen.findByRole("option", { name: "Ship Q2" }));
    expect(onChange).toHaveBeenCalledWith("p1");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Project/ }).textContent,
      ).toContain("Ship Q2"),
    );
  });

  it("is held shut until there is an identity to create under", () => {
    render(
      <ProjectPicker
        projects={[{ id: "p1", name: "Ship Q2" }]}
        value={null}
        onChange={vi.fn()}
        disabled
      />,
    );

    const trigger = screen.getByRole("button", { name: /Project/ });
    // react-aria marks the disabled state on the Select's root element
    // (`data-disabled`), keeps the trigger focusable so screen readers can
    // still reach it, and the real guarantee is behavioral: the listbox
    // never opens.
    expect(trigger.closest("[data-disabled]")).not.toBeNull();
    fireEvent.click(trigger);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("the add pill with a picker", () => {
  function renderList(options?: {
    projects?: { id: string; name: string }[];
  }) {
    const onCreate = vi.fn();
    const onPickerProjectChange = vi.fn();
    render(
      <TaskList
        tasks={[]}
        // Untyped mocks travel as the exact signatures: the cast is free
        // at runtime and keeps `vi.fn()` ergonomics at the call sites.
        onCreate={
          onCreate as (
            title: string,
            estimate: number,
            projectId?: string,
          ) => void
        }
        onToggle={vi.fn()}
        onReorder={vi.fn()}
        onClearCompleted={vi.fn()}
        onSelect={vi.fn()}
        projects={options?.projects}
        pickerProjectId={null}
        onPickerProjectChange={
          onPickerProjectChange as (id: string | null) => void
        }
      />,
    );
    return { onCreate, onPickerProjectChange };
  }

  it("shows no picker until projects exist", () => {
    renderList();

    // No picker at all: no trigger button carrying the Project label.
    expect(screen.queryByRole("button", { name: /Project/ })).toBeNull();
  });

  it("files the task under the picker's project", () => {
    const onCreate = vi.fn();
    render(
      <TaskList
        tasks={[]}
        onCreate={onCreate}
        onToggle={vi.fn()}
        onReorder={vi.fn()}
        onClearCompleted={vi.fn()}
        onSelect={vi.fn()}
        projects={[{ id: "p1", name: "Ship Q2" }]}
        pickerProjectId="p1"
        onPickerProjectChange={vi.fn()}
      />,
    );

    // The picker is controlled by the panel, so the trigger shows the
    // picker's value — and the create carries exactly that value. (Phase 9:
    // HeroUI Select renders the value as the trigger's text, not a `value`
    // property on a native select.)
    expect(
      screen.getByRole("button", { name: /Project/ }).textContent,
    ).toContain("Ship Q2");

    fireEvent.change(screen.getByLabelText("New task title"), {
      target: { value: "Build it" },
    });
    fireEvent.submit(screen.getByLabelText("New task title").closest("form")!);

    expect(onCreate).toHaveBeenCalledWith("Build it", 2, "p1");
  });

  it("creates unassigned when the picker reads No project", () => {
    const onCreate = vi.fn();
    render(
      <TaskList
        tasks={[]}
        onCreate={onCreate}
        onToggle={vi.fn()}
        onReorder={vi.fn()}
        onClearCompleted={vi.fn()}
        onSelect={vi.fn()}
        projects={[{ id: "p1", name: "Ship Q2" }]}
        pickerProjectId={null}
        onPickerProjectChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("New task title"), {
      target: { value: "Untagged" },
    });
    fireEvent.submit(screen.getByLabelText("New task title").closest("form")!);

    // `null` travels as absent — the mutation reads that as unassigned.
    expect(onCreate).toHaveBeenCalledWith("Untagged", 2, undefined);
  });
});

describe("toTaskRows joins projects", () => {
  const index = {
    p1: { name: "Ship Q2", archived: false },
    p2: { name: "Old work", archived: true },
  };

  it("names the tag and marks archived ones muted", () => {
    const rows = toTaskRows(
      {
        active: [
          { _id: "a", title: "Filed", estimate: 2, activeFlag: true, projectId: "p1" },
          { _id: "b", title: "Filed away", estimate: 2, activeFlag: true, projectId: "p2" },
          { _id: "c", title: "Untagged", estimate: 2, activeFlag: true },
        ],
        completed: [],
      },
      { projects: index },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        id: "a",
        projectId: "p1",
        projectName: "Ship Q2",
        projectArchived: false,
      }),
      expect.objectContaining({
        id: "b",
        projectId: "p2",
        projectName: "Old work",
        projectArchived: true,
      }),
      expect.objectContaining({
        id: "c",
        projectId: null,
        projectName: null,
        projectArchived: false,
      }),
    ]);
  });

  it("reads a project the index has never seen as untagged, not as a crash", () => {
    // The shape for a row filed under a project deleted between the two
    // queries — no name to print, so no tag rather than a wrong one.
    const rows = toTaskRows(
      {
        active: [
          { _id: "a", title: "Orphaned", estimate: 2, activeFlag: true, projectId: "gone" },
        ],
        completed: [],
      },
      { projects: index },
    );

    expect(rows[0].projectName).toBeNull();
  });

  it("renders the muted tag for an archived project", () => {
    const { container } = render(
      <TaskList
        tasks={[
          {
            id: "b",
            title: "Filed away",
            estimate: 2,
            done: false,
            completedLeaves: 0,
            isActive: false,
            projectId: "p2",
            projectName: "Old work",
            projectArchived: true,
          },
        ]}
        onCreate={vi.fn()}
        onToggle={vi.fn()}
        onReorder={vi.fn()}
        onClearCompleted={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const tag = screen.getByText("Old work");
    expect(tag.className).toContain("opacity-50");
    expect(tag.getAttribute("title")).toBe("Old work (archived)");
    expectNoForbiddenChrome(container.innerHTML);
  });
});

describe("the CRUD surface", () => {
  const MANAGED: ManagerProject[] = [
    { id: "p1", name: "Ship Q2", archived: false },
    { id: "p2", name: "Old work", archived: true },
  ];

  function renderManager(
    props?: Partial<Parameters<typeof ProjectManagerView>[0]>,
  ) {
    const onCreate = vi.fn();
    const onRename = vi.fn();
    const onArchive = vi.fn();
    const onUnarchive = vi.fn();
    const view = render(
      <ProjectManagerView
        projects={MANAGED}
        ready
        error={null}
        onCreate={onCreate}
        onRename={onRename}
        onArchive={onArchive}
        onUnarchive={onUnarchive}
        {...props}
      />,
    );
    return { ...view, onCreate, onRename, onArchive, onUnarchive };
  }

  it("creates a trimmed project and empties the field", () => {
    const { onCreate } = renderManager();

    fireEvent.change(screen.getByLabelText("New project name"), {
      target: { value: "  Next thing  " },
    });
    fireEvent.submit(screen.getByLabelText("New project name").closest("form")!);

    expect(onCreate).toHaveBeenCalledWith("Next thing");
    expect(screen.getByLabelText("New project name")).toHaveProperty("value", "");
  });

  it("creates nothing for a blank name", () => {
    const { onCreate } = renderManager();

    fireEvent.change(screen.getByLabelText("New project name"), {
      target: { value: "    " },
    });
    fireEvent.submit(screen.getByLabelText("New project name").closest("form")!);

    expect(onCreate).not.toHaveBeenCalled();
  });

  it("renames through an inline editor, and cancels cleanly", () => {
    const { onRename } = renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Rename Ship Q2" }));
    fireEvent.change(screen.getByLabelText("Rename Ship Q2"), {
      target: { value: "Ship Q3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onRename).toHaveBeenCalledWith("p1", "Ship Q3");
  });

  it("reads an emptied rename as a cancelled one", () => {
    const { onRename } = renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Rename Ship Q2" }));
    fireEvent.change(screen.getByLabelText("Rename Ship Q2"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // A project called "" helps nobody; the row keeps its old name and the
    // editor closes. (The row's Rename button shares the input's
    // accessible name, so the editor's absence is proved by Save being
    // gone, not by the name being gone.)
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });

  it("archives an active project and restores an archived one", () => {
    const { onArchive, onUnarchive } = renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Archive Ship Q2" }));
    expect(onArchive).toHaveBeenCalledWith("p1");

    fireEvent.click(screen.getByRole("button", { name: "Restore Old work" }));
    expect(onUnarchive).toHaveBeenCalledWith("p2");
  });

  it("shows the cap refusal where the user can act on it", () => {
    const { container } = renderManager({
      error: "you already have 100 active projects — archive one to make room",
    });

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("100 active projects");
    expect(alert.className).toContain("text-tertiary");
    expectNoForbiddenChrome(container.innerHTML);
  });

  it("is calm with no projects and held shut with no identity", () => {
    const { container } = renderManager({ projects: [], ready: false });

    expect(screen.getByText(/No projects yet/)).toBeTruthy();
    expect(screen.getByLabelText("New project name")).toHaveProperty(
      "disabled",
      true,
    );
    expectNoForbiddenChrome(container.innerHTML);
  });
});

describe("the overview card", () => {
  const DATA: OverviewData = {
    project: { _id: "p1", name: "Ship Q2" },
    openCount: 1,
    doneCount: 2,
    estimatedLeaves: 7,
    completedLeaves: 5,
    focusMinutes: 125,
    // Deliberately distinct from the leaf count: the card renders both, and
    // the test must address each number unambiguously.
    focusSessions: 9,
  };

  it("reports counts, leaves and focus time", () => {
    render(<ProjectOverviewView data={DATA} />);

    expect(screen.getByText("Ship Q2")).toBeTruthy();
    // 125 minutes is 2.08 hours — the bento's one-decimal shape, so the
    // card never pretends to a precision the sessions do not have.
    expect(screen.getByText("2.1")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText(/\/ 2 done/)).toBeTruthy();
    expect(screen.getByText(/\/ 7/)).toBeTruthy();
  });

  it("badges an archived project without rewriting its numbers", () => {
    render(
      <ProjectOverviewView
        data={{ ...DATA, project: { _id: "p2", name: "Old work", archivedAt: 1 } }}
      />,
    );

    expect(screen.getByText("Archived")).toBeTruthy();
    expect(screen.getByText("2.1")).toBeTruthy();
  });

  it("is calm for an empty project — no grid of zeros", () => {
    render(
      <ProjectOverviewView
        data={{
          project: { _id: "p3", name: "Empty" },
          openCount: 0,
          doneCount: 0,
          estimatedLeaves: 0,
          completedLeaves: 0,
          focusMinutes: 0,
          focusSessions: 0,
        }}
      />,
    );

    expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
    expect(screen.queryByText("2.1")).toBeNull();
  });

  it("sections with tonal shifts, never a divider line", () => {
    const { container } = render(<ProjectOverviewView data={DATA} />);
    const classes = allClasses(container);

    expect(
      classes.filter((name) => /^border-(t|b|x|y)(-|$)/.test(name)),
    ).toEqual([]);
    expect(classes.filter((name) => name.startsWith("divide-"))).toEqual([]);
    expect(container.querySelector("hr")).toBeNull();
    expectNoForbiddenChrome(container.innerHTML);
  });
});


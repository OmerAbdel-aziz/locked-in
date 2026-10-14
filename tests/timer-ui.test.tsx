import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Page from "@/app/page";
import { ProgressRing } from "@/components/timer/progress-ring";
import { TimerControls, primaryLabel } from "@/components/timer/timer-controls";
import { TimerReadout, formatRemaining } from "@/components/timer/timer-readout";
import { TimerEngine } from "@/components/timer/timer-engine";
import { DEFAULT_SETTINGS, initialTimerState } from "@/lib/pomodoro";
import { useTimerStore } from "@/lib/store/timer";

/**
 * Task 7 gate: the Timer Engine column.
 *
 * Three of the acceptance lines are visual, so they are pinned here as the
 * *structural* properties that produce the visual result — the ring's
 * geometry, the classes that carry the design tokens, and the control
 * labels. A pixel comparison belongs to the Playwright suite (Task 27);
 * what can be proved in jsdom is that every ingredient of `screen.png` is
 * present and wired to the store.
 *
 * The two DESIGN.md rules that are easy to regress silently get their own
 * tests: no pure white anywhere, and no 1px border used to section content.
 */

const MIN = 60_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  act(() => {
    useTimerStore.setState({
      state: initialTimerState(),
      settings: DEFAULT_SETTINGS,
    });
  });
});

afterEach(() => {
  // Auto-cleanup is off because vitest globals are disabled, so the DOM
  // would otherwise accumulate across tests and `getByRole` would match
  // several stale trees at once.
  cleanup();
  vi.useRealTimers();
});

/** Every class name used anywhere in a rendered tree. */
function allClasses(node: HTMLElement): string[] {
  return Array.from(node.querySelectorAll("*"))
    .flatMap((el) => Array.from(el.classList))
    .concat(Array.from(node.classList));
}

describe("the progress ring matches the design's geometry", () => {
  it("uses the design's radius, stroke width and -90deg rotation", () => {
    // `code.html`: r="48%", stroke-width="4", transform -rotate-90, in a
    // container sized max-w-md (448px). The viewBox is 448 units precisely
    // so that stroke-width 4 renders as the 4px the design specifies.
    const { container } = render(<ProgressRing variant="idle" progress={0} />);
    const svg = container.querySelector("svg");

    expect(svg?.getAttribute("viewBox")).toBe("0 0 448 448");
    expect(svg?.getAttribute("class")).toContain("-rotate-90");

    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(2);
    for (const circle of circles) {
      expect(circle.getAttribute("r")).toBe(String(448 * 0.48));
      expect(circle.getAttribute("stroke-width")).toBe("4");
    }
  });

  it("draws a track at 10% opacity and a round-capped progress stroke", () => {
    const { container } = render(<ProgressRing variant="running" progress={0.5} />);

    const [track, progress] = Array.from(container.querySelectorAll("circle"));

    expect(track.getAttribute("stroke")).toBe(
      "var(--color-surface-container-highest)",
    );
    expect(track.getAttribute("stroke-opacity")).toBe("0.1");

    // DESIGN.md §5: round caps, and the progress is a `primary` gradient
    // rather than a flat fill — a flat fill is the one thing the ring must
    // never be.
    expect(progress.getAttribute("stroke-linecap")).toBe("round");
    expect(progress.getAttribute("stroke")).toBe(
      "url(#ring-progress-gradient)",
    );

    const stops = container.querySelectorAll("stop");
    expect(stops).toHaveLength(2);
    expect(stops[0]?.getAttribute("stop-color")).toBe("var(--color-primary)");
    expect(stops[1]?.getAttribute("stop-color")).toBe(
      "var(--color-primary-container)",
    );
  });

  it("shows the full muted circle at rest, exactly as screen.png does", () => {
    const { container } = render(<ProgressRing variant="idle" progress={0} />);

    const progress = Array.from(container.querySelectorAll("circle"))[1];
    // A complete circle, not an empty track: idle means the whole session is
    // still ahead. It must also stay muted, never green, until you start.
    expect(progress?.getAttribute("stroke-dashoffset")).toBe("0");
    expect(progress?.getAttribute("stroke")).toBe(
      "var(--color-surface-container-highest)",
    );
  });

  it("reveals elapsed time as a muted arc while paused, not a full circle", () => {
    const { container } = render(<ProgressRing variant="paused" progress={0.25} />);

    const progress = Array.from(container.querySelectorAll("circle"))[1];
    const circumference = 2 * Math.PI * (448 * 0.48);

    // Paused is the derived running state with the gradient withheld: the
    // arc still reports how much was spent, but in the calm surface tone.
    expect(progress?.getAttribute("stroke")).toBe(
      "var(--color-surface-container-highest)",
    );
    expect(Number(progress?.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      circumference * 0.75,
      3,
    );
  });

  it("draws no arc before any progress", () => {
    const { container } = render(<ProgressRing variant="running" progress={0} />);

    const progress = Array.from(container.querySelectorAll("circle"))[1];
    const circumference = 2 * Math.PI * (448 * 0.48);
    expect(Number(progress?.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      circumference,
      3,
    );
  });

  it("clamps a progress fraction outside 0..1", () => {
    const circumference = 2 * Math.PI * (448 * 0.48);

    // Below zero draws nothing; above one draws a whole circle rather than
    // an arc that doubles back over the track.
    for (const progress of [-1, 4, Number.NaN]) {
      const { container, unmount } = render(
        <ProgressRing variant="running" progress={progress} />,
      );
      const stroke = Array.from(container.querySelectorAll("circle"))[1];
      const expected = progress > 1 ? 0 : circumference;
      expect(Number(stroke?.getAttribute("stroke-dashoffset"))).toBeCloseTo(
        expected,
        3,
      );
      unmount();
    }
  });

  it("gives the ring a definite width instead of collapsing to its content", () => {
    render(<TimerEngine />);

    const section = screen.getByRole("region", { name: "Timer engine" });
    const ringWrapper = section.firstElementChild;

    // The ring is `w-full` inside a shrink-to-fit flex item, so without a
    // definite width on the item itself it resolves against its own content
    // — the digits — and the circle collapses to the width of the face. It
    // did exactly that before this fix, which is why the assertion is on the
    // section rather than the ring.
    expect(section.className).toContain("max-w-md");
    expect(ringWrapper?.className).toMatch(/aspect-square/);
    // …and the readout sizes itself to that ring via container query units.
    expect(ringWrapper?.className).toContain("@container");
  });
});

describe("the readout", () => {
  it("reads Session N of M over monospace digits", () => {
    const { container } = render(
      <TimerReadout remaining={25 * MIN} cyclePosition={3} sessionCount={4} />,
    );

    expect(screen.getByText("Session 3 of 4")).toBeTruthy();

    const digits = container.querySelector("h1");
    expect(digits?.textContent).toBe("25:00");
    // JetBrains Mono is the "interface's heartbeat" (DESIGN.md §3) — the
    // digits are the one place a proportional font would be wrong.
    expect(digits?.className).toContain("font-mono");
    // Sized against the ring, not the viewport. A fixed px size made the
    // face overflow the circle on a narrow one; the design keeps the digits
    // just under 60% of the ring's diameter.
    expect(digits?.className).toContain("text-[22cqw]");
  });

  it("formats mm:ss, rounding up so a fresh phase does not open on 24:59", () => {
    expect(formatRemaining(25 * MIN)).toBe("25:00");
    expect(formatRemaining(25 * MIN - 1)).toBe("25:00");
    expect(formatRemaining(25 * MIN - 999)).toBe("25:00");
    expect(formatRemaining(1_500)).toBe("00:02");
    expect(formatRemaining(1_000)).toBe("00:01");
    expect(formatRemaining(0)).toBe("00:00");
    // A backwards clock jump must never print a negative face.
    expect(formatRemaining(-1)).toBe("00:00");
  });
});

describe("the primary CTA names the action the state actually offers", () => {
  it("derives the label from phase and status", () => {
    expect(primaryLabel("focus", "idle")).toBe("Start Focus Session");
    expect(primaryLabel("short", "idle")).toBe("Start Short Break");
    expect(primaryLabel("long", "idle")).toBe("Start Long Break");
    expect(primaryLabel("focus", "running")).toBe("Pause");
    expect(primaryLabel("focus", "paused")).toBe("Resume");
  });

  it("uses the 145deg gradient, never a flat fill", () => {
    render(<TimerEngine />);
    const cta = screen.getByRole("button", { name: "Start Focus Session" });
    expect(cta.className).toContain("cta-gradient");
  });
});

describe("the engine is wired to the store", () => {
  it("starts, pauses and resumes through the one CTA", () => {
    render(<TimerEngine />);

    fireEvent.click(screen.getByRole("button", { name: "Start Focus Session" }));
    expect(useTimerStore.getState().state.status).toBe("running");
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(useTimerStore.getState().state.status).toBe("paused");
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(useTimerStore.getState().state.status).toBe("running");
  });

  it("gives the ring the gradient once running", () => {
    const { container } = render(<TimerEngine />);

    const strokeBefore = () =>
      Array.from(container.querySelectorAll("circle"))[1]?.getAttribute("stroke");

    expect(strokeBefore()).toBe("var(--color-surface-container-highest)");

    act(() => useTimerStore.getState().start());
    expect(strokeBefore()).toBe("url(#ring-progress-gradient)");
  });

  it("shows Reset and Skip alongside the CTA — the design ships only the CTA, PRD §4.1 requires all three", () => {
    render(<TimerEngine />);

    expect(screen.getByRole("button", { name: "Start Focus Session" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
  });

  it("Skip advances without the session counting", () => {
    render(<TimerEngine />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    const { phase, cyclePosition } = useTimerStore.getState().state;
    // Focus 1 of 4 was abandoned, not completed: still owing session 1, now
    // on a short break — never the long one, which only a completion can
    // grant.
    expect(phase).toBe("short");
    expect(cyclePosition).toBe(1);
    expect(screen.getByText("05:00")).toBeTruthy();
  });

  it("auto-starts the break a skip hands over (decision D4)", () => {
    render(<TimerEngine />);

    fireEvent.click(screen.getByRole("button", { name: "Skip" }));

    // `autoStartBreak` defaults to true, so the break runs without a second
    // click. The policy lives in the engine; this pins that the UI follows.
    expect(useTimerStore.getState().state.status).toBe("running");
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("Reset returns to a full idle phase, keeping the phase and position", () => {
    render(<TimerEngine />);

    act(() => useTimerStore.getState().start());
    vi.setSystemTime(Date.now() + 10 * MIN);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    const { phase, cyclePosition, status, phaseEndsAt } =
      useTimerStore.getState().state;
    expect(status).toBe("idle");
    expect(phaseEndsAt).toBeNull();
    expect(phase).toBe("focus");
    expect(cyclePosition).toBe(1);
    expect(screen.getByText("25:00")).toBeTruthy();
  });

  it("repositions the engine from the tabs without touching the cycle", () => {
    // The tabs live in the header, so the page is what has to be rendered.
    render(<Page />);

    act(() => useTimerStore.getState().start());
    act(() => useTimerStore.getState().skip());
    // Now on a short break, still owing session 1.
    expect(useTimerStore.getState().state.cyclePosition).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Long Break" }));

    const { phase, cyclePosition, status } = useTimerStore.getState().state;
    // Selecting a tab is neither completion nor skip.
    expect(phase).toBe("long");
    expect(cyclePosition).toBe(1);
    expect(status).toBe("idle");
  });

  it("offers a Start label that follows the selected phase", () => {
    render(<Page />);

    const tabs: [string, string][] = [
      ["Focus", "Start Focus Session"],
      ["Short Break", "Start Short Break"],
      ["Long Break", "Start Long Break"],
    ];

    for (const [tab, cta] of tabs) {
      fireEvent.click(screen.getByRole("button", { name: tab }));
      expect(screen.getByRole("button", { name: cta })).toBeTruthy();
    }
  });
});

describe("the page keeps the canonical two-column composition (ADR-004)", () => {
  it("splits the grid 7/5 with the engine on the left", () => {
    const { container } = render(<Page />);

    const left = container.querySelector("main > div:nth-child(1)");
    const right = container.querySelector("main > div:nth-child(2)");

    expect(left?.className).toContain("lg:col-span-7");
    expect(right?.className).toContain("lg:col-span-5");
    expect(left?.textContent).toContain("25:00");
  });

  it("mounts the live engine rather than a static placeholder", () => {
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: "Start Focus Session" }));
    expect(useTimerStore.getState().state.status).toBe("running");
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });
});

describe("DESIGN.md's binding rules hold in the rendered output", () => {
  function expectNoForbiddenChrome(html: string) {
    // No pure white (DESIGN.md §5) — the whole palette is built to avoid it.
    expect(html).not.toMatch(/#f{3,6}\b/i);
    expect(html).not.toMatch(/\b(text|bg|border|fill|stroke)-white\b/);
  }

  it("uses no pure white in the timer column", () => {
    const { container } = render(<TimerEngine />);
    expectNoForbiddenChrome(container.innerHTML);
  });

  it("uses no pure white in the page", () => {
    const { container } = render(<Page />);
    expectNoForbiddenChrome(container.innerHTML);
  });

  it("sections with tonal shifts, never a 1px divider", () => {
    const { container } = render(<Page />);

    const onePixelLines = allClasses(container).filter(
      (cls) =>
        // The default Tailwind border width is 1px; any explicit `border-b-2`
        // and the tab underline are control affordances, not sectioning.
        /^border(-(t|r|b|l|x|y))?$/.test(cls) || /^divide-/.test(cls),
    );

    expect(onePixelLines).toEqual([]);
  });
});

describe("the ghost controls", () => {
  it("carry no background until hovered (DESIGN.md §5)", () => {
    render(<TimerControls
      phase="focus"
      status="idle"
      onStart={() => {}}
      onPause={() => {}}
      onResume={() => {}}
      onReset={() => {}}
      onSkip={() => {}}
    />);

    for (const name of ["Skip", "Reset"]) {
      const button = screen.getByRole("button", { name });
      const baseBackgrounds = Array.from(button.classList).filter(
        (cls) => cls.startsWith("bg-") && !cls.startsWith("hover:"),
      );

      // Ghost means exactly this: no fill at rest, a tonal shift on hover.
      expect(baseBackgrounds).toEqual([]);
      expect(button.className).toContain("hover:bg-surface-container-high");
    }
  });
});

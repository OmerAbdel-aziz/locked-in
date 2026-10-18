import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Page from "@/app/page";
import {
  FocusShroud,
  SHROUD_BASE_CLASS,
  ShroudToggle,
  shouldShroudActive,
  shouldShowShroudToggle,
} from "@/components/shroud/focus-shroud";
import { TimerEngine } from "@/components/timer/timer-engine";
import { DEFAULT_SETTINGS, initialTimerState } from "@/lib/pomodoro";
import { useTimerStore } from "@/lib/store/timer";

/**
 * Task 18 gate: the Focus Shroud.
 *
 * Acceptance: active during running focus only; auto-dismiss when the focus
 * phase ends; timer + active task stay visible/interactive; the salvaged
 * snippet is the base; no invented shroud styling.
 */

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => () => Promise.resolve(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

function resetStore() {
  act(() => {
    useTimerStore.setState({
      state: initialTimerState(),
      settings: DEFAULT_SETTINGS,
      shroudEnabled: true,
    });
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_700_000_000_000);
  resetStore();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("shouldShroudActive — the visibility rule", () => {
  it("is active only for a running focus phase with the toggle on", () => {
    expect(shouldShroudActive("focus", "running", true)).toBe(true);
  });

  it("auto-dismisses on pause, idle, breaks, completion, and toggle-off", () => {
    expect(shouldShroudActive("focus", "paused", true)).toBe(false);
    expect(shouldShroudActive("focus", "idle", true)).toBe(false);
    expect(shouldShroudActive("short", "running", true)).toBe(false);
    expect(shouldShroudActive("long", "running", true)).toBe(false);
    expect(shouldShroudActive("focus", "running", false)).toBe(false);
  });
});

describe("shouldShowShroudToggle — the control's visibility rule", () => {
  it("appears exactly while a focus session runs — veil state is irrelevant", () => {
    expect(shouldShowShroudToggle("focus", "running")).toBe(true);
    expect(shouldShowShroudToggle("focus", "paused")).toBe(false);
    expect(shouldShowShroudToggle("focus", "idle")).toBe(false);
    expect(shouldShowShroudToggle("short", "running")).toBe(false);
    expect(shouldShowShroudToggle("long", "running")).toBe(false);
  });
});

describe("the store toggle", () => {
  it("defaults ON and flips", () => {
    expect(useTimerStore.getState().shroudEnabled).toBe(true);
    act(() => useTimerStore.getState().setShroudEnabled(false));
    expect(useTimerStore.getState().shroudEnabled).toBe(false);
  });
});

describe("the veil", () => {
  it("is built on the salvaged snippet, with only easing + active opacity added", () => {
    // The snippet's own classes must all survive; the only additions allowed
    // are the sanctuary transition and the conditional opacity.
    for (const cls of [
      "fixed",
      "inset-0",
      "bg-background/80",
      "backdrop-blur-sm",
      "pointer-events-none",
      "z-40",
    ]) {
      expect(SHROUD_BASE_CLASS).toContain(cls);
    }
    expect(SHROUD_BASE_CLASS).toContain("ease-sanctuary");
    expect(SHROUD_BASE_CLASS).toContain("transition-opacity");
  });

  it("is hidden at rest and shown once a focus session runs", () => {
    render(<FocusShroud />);
    const veil = screen.getByTestId("focus-shroud");
    expect(veil.getAttribute("data-active")).toBe("false");
    expect(veil.className).toContain("opacity-0");

    act(() => useTimerStore.getState().start());
    expect(veil.getAttribute("data-active")).toBe("true");
    expect(veil.className).toContain("opacity-100");
  });

  it("auto-dismisses when the focus phase ends (complete / skip / reset / tab)", () => {
    render(<FocusShroud />);
    const veil = screen.getByTestId("focus-shroud");

    act(() => useTimerStore.getState().start());
    expect(veil.getAttribute("data-active")).toBe("true");

    // Skip advances focus -> short break: the veil must fall.
    act(() => useTimerStore.getState().skip());
    expect(veil.getAttribute("data-active")).toBe("false");

    // And a fresh running focus raises it again; pausing drops it.
    act(() => useTimerStore.getState().setPhase("focus"));
    act(() => useTimerStore.getState().start());
    expect(veil.getAttribute("data-active")).toBe("true");
    act(() => useTimerStore.getState().pause());
    expect(veil.getAttribute("data-active")).toBe("false");
  });

  it("dismisses on Escape without pausing the timer", () => {
    render(<FocusShroud />);
    act(() => useTimerStore.getState().start());
    expect(screen.getByTestId("focus-shroud").getAttribute("data-active")).toBe(
      "true",
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(useTimerStore.getState().shroudEnabled).toBe(false);
    expect(screen.getByTestId("focus-shroud").getAttribute("data-active")).toBe(
      "false",
    );
    // Dismissal is display-only: the session keeps running.
    expect(useTimerStore.getState().state.status).toBe("running");
  });
});

describe("timer + active task stay above the veil", () => {
  it("elevates the whole left column above the root-level veil while active", () => {
    // Regression (2026-10-16): the column carries the `.enter` animation,
    // whose fill mode is a permanent stacking context — the engine/card
    // `z-50` set inside it never escaped, and the timer rendered dimmed
    // under its own veil. The elevation lives on the column itself, which
    // compares against the veil at the root level.
    render(<Page />);
    const column = screen.getByTestId("shroud-column");
    expect(column.getAttribute("data-shroud-elevated")).toBe("false");
    expect(column.className).not.toContain("z-50");

    act(() => useTimerStore.getState().start());
    expect(column.getAttribute("data-shroud-elevated")).toBe("true");
    expect(column.className).toContain("relative");
    expect(column.className).toContain("z-50");

    act(() => useTimerStore.getState().skip());
    expect(column.getAttribute("data-shroud-elevated")).toBe("false");
    expect(column.className).not.toContain("z-50");
  });

  it("elevates the engine section to z-50 only while the shroud is up", () => {
    render(<TimerEngine />);
    const section = screen.getByRole("region", { name: "Timer engine" });
    expect(section.className).not.toContain("z-50");

    act(() => useTimerStore.getState().start());
    expect(section.className).toContain("z-50");

    act(() => useTimerStore.getState().pause());
    expect(section.className).not.toContain("z-50");
  });

  it("elevates the progress-card wrapper only while the shroud is up", () => {
    render(<Page />);
    const wrap = screen.getByTestId("progress-card-wrap");
    expect(wrap.getAttribute("data-shroud-elevated")).toBe("false");

    act(() => useTimerStore.getState().start());
    expect(wrap.getAttribute("data-shroud-elevated")).toBe("true");
    expect(wrap.className).toContain("z-50");
  });
});

describe("the toggle", () => {
  it("mounts only while a focus session runs, hides the veil when pressed, and stays usable after dismissal", () => {
    render(
      <>
        <FocusShroud />
        <ShroudToggle />
      </>,
    );
    // Idle: nothing to shroud, so the control is absent.
    expect(screen.queryByTestId("shroud-toggle")).toBeNull();

    act(() => useTimerStore.getState().start());
    expect(screen.getByTestId("focus-shroud").getAttribute("data-active")).toBe(
      "true",
    );
    const toggle = screen.getByTestId("shroud-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("focus-shroud").getAttribute("data-active")).toBe(
      "false",
    );
    // Dismissal is display-only: the control stays armed for a re-enable and
    // the timer keeps running.
    expect(screen.getByTestId("shroud-toggle")).toBeTruthy();
    expect(useTimerStore.getState().state.status).toBe("running");
  });

  it("unmounts on pause and stays gone for breaks and idle", () => {
    render(
      <>
        <FocusShroud />
        <ShroudToggle />
      </>,
    );

    act(() => useTimerStore.getState().start());
    expect(screen.getByTestId("shroud-toggle")).toBeTruthy();

    act(() => useTimerStore.getState().pause());
    expect(screen.queryByTestId("shroud-toggle")).toBeNull();

    act(() => useTimerStore.getState().resume());
    expect(screen.getByTestId("shroud-toggle")).toBeTruthy();

    act(() => useTimerStore.getState().skip());
    expect(screen.queryByTestId("shroud-toggle")).toBeNull();
  });

  it("mounts on the focus page only while a focus session runs", () => {
    render(<Page />);
    expect(screen.queryByTestId("shroud-toggle")).toBeNull();

    act(() => useTimerStore.getState().start());
    expect(screen.getByTestId("shroud-toggle")).toBeTruthy();
    expect(screen.getByTestId("focus-shroud")).toBeTruthy();
  });
});

describe("DESIGN.md rules hold on the new surfaces", () => {
  it("uses no pure white and no 1px sectioning border", () => {
    const { container } = render(
      <>
        <FocusShroud />
        <ShroudToggle />
      </>,
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/#f{3,6}\b/i);
    expect(html).not.toMatch(/\b(text|bg|border|fill|stroke)-white\b/);
    const classes = Array.from(container.querySelectorAll("*")).flatMap((el) =>
      Array.from(el.classList),
    );
    expect(
      classes.filter(
        (cls) =>
          /^border(-(t|r|b|l|x|y))$/.test(cls) || /^divide-/.test(cls),
      ),
    ).toEqual([]);
  });
});

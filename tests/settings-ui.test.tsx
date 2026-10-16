import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

import { StreakBadge } from "@/components/chrome/streak-badge";
import { PhaseNotice } from "@/components/settings/phase-notice";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { SettingsSync } from "@/components/settings/settings-sync";
import { DEFAULT_SETTINGS, initialTimerState } from "@/lib/pomodoro";
import { useTimerStore } from "@/lib/store/timer";

/**
 * Task 15–17 gate: the chrome the user actually sees.
 *
 * The badge, the dialog, the toast and the sync bridge are proved here as
 * *rendered markup and store effects* — the Convex binding is stubbed at
 * the module boundary (as in `tests/timer-ui.test.tsx`), while the live
 * queries are proved for real in `tests/settings.test.ts`. The DESIGN.md
 * rules that are easy to regress silently get the same treatment as the
 * timer and task suites: no pure white, no 1px sectioning line, and
 * JetBrains Mono on the chrome.
 */

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

const mockQuery = vi.mocked(useQuery);
const mockMutation = vi.mocked(useMutation);

const SERVER_SETTINGS = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  sessionCount: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  notificationsEnabled: true,
};

function resetStore() {
  useTimerStore.setState({
    state: initialTimerState(),
    settings: DEFAULT_SETTINGS,
    notificationsEnabled: true,
    phaseNotice: null,
    activeTask: null,
    boundTask: null,
    sessionLogger: null,
  });
}

beforeEach(() => {
  resetStore();
  mockQuery.mockReset();
  mockMutation.mockReset();
  stubUpdate();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** A `settings.update` double, returned by the mocked `useMutation`. */
function stubUpdate() {
  const update = vi.fn(() => Promise.resolve());
  mockMutation.mockReturnValue(update as never);
  return update;
}

function openDialog() {
  render(<SettingsDialog />);
  fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
}

describe("the streak badge", () => {
  it("shows the derived streak once the query settles", () => {
    mockQuery.mockReturnValue(5);
    render(<StreakBadge />);

    expect(screen.getByText("Streak: 5")).toBeTruthy();
    expect(
      screen.getByLabelText("Streak: 5", { selector: "div" }),
    ).toBeTruthy();
  });

  it("keeps its shape while settling instead of jumping", () => {
    mockQuery.mockReturnValue(undefined);
    const { container } = render(<StreakBadge />);

    expect(screen.getByText("Streak: –")).toBeTruthy();
    // The pill is already there — same rounded-full tonal treatment as the
    // placeholder it replaced, so the header does not reflow when the
    // number lands.
    expect(container.firstElementChild?.className).toContain("rounded-full");
  });

  it("carries a fire mark, not an emoji", () => {
    mockQuery.mockReturnValue(5);
    const { container } = render(<StreakBadge />);

    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("the settings dialog", () => {
  it("opens from the header trigger and shows the server values", () => {
    mockQuery.mockReturnValue(SERVER_SETTINGS);
    openDialog();

    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(
      (screen.getByLabelText("Focus in min") as HTMLInputElement).value,
    ).toBe("25");
    expect(
      (screen.getByLabelText("Sessions in per cycle") as HTMLInputElement)
        .value,
    ).toBe("4");
  });

  it("waits calmly while the identity settles", () => {
    mockQuery.mockReturnValue(undefined);
    openDialog();

    expect(screen.getByText("Loading settings…")).toBeTruthy();
  });

  it("saves edited durations through the mutation", async () => {
    mockQuery.mockReturnValue(SERVER_SETTINGS);
    const update = stubUpdate();
    openDialog();

    fireEvent.change(screen.getByLabelText("Focus in min"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({
      focusMin: 50,
      shortMin: 5,
      longMin: 15,
      sessionCount: 4,
    });
  });

  it("refuses an out-of-range duration with an inline error, not a write", () => {
    mockQuery.mockReturnValue(SERVER_SETTINGS);
    const update = stubUpdate();
    openDialog();

    fireEvent.change(screen.getByLabelText("Focus in min"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByRole("alert").textContent).toMatch(/whole number/);
    expect(update).not.toHaveBeenCalled();
  });

  it("applies toggles immediately, including the notifications flag", async () => {
    mockQuery.mockReturnValue(SERVER_SETTINGS);
    const update = stubUpdate();
    openDialog();

    fireEvent.click(screen.getByRole("switch", { name: "Auto-start breaks" }));
    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledWith({ autoStartBreak: false }),
    );

    fireEvent.click(
      screen.getByRole("switch", { name: "Browser notifications" }),
    );
    await vi.waitFor(() =>
      expect(update).toHaveBeenCalledWith({ notificationsEnabled: false }),
    );
  });

  it("closes from the Close control and from the overlay", () => {
    mockQuery.mockReturnValue(SERVER_SETTINGS);
    const { container } = render(<SettingsDialog />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    const overlay = container.querySelector(".fixed.inset-0");
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay!);
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });
});

describe("the settings sync bridge", () => {
  it("carries the server row into the timer store", () => {
    mockQuery.mockReturnValue({ ...SERVER_SETTINGS, focusMin: 50 });

    render(<SettingsSync />);

    expect(useTimerStore.getState().settings.focusMin).toBe(50);
    expect(useTimerStore.getState().notificationsEnabled).toBe(true);
  });

  it("waits for the query instead of clobbering local state", () => {
    mockQuery.mockReturnValue(undefined);
    act(() => useTimerStore.getState().setSettings({ focusMin: 50 }));

    render(<SettingsSync />);

    expect(useTimerStore.getState().settings.focusMin).toBe(50);
  });
});

describe("the in-app phase-end notice", () => {
  it("renders nothing without a completion", () => {
    const { container } = render(<PhaseNotice />);
    expect(container.innerHTML).toBe("");
  });

  it("shows the ended phase and dismisses on request", () => {
    act(() => {
      useTimerStore.setState({
        phaseNotice: { phase: "focus", at: 1_700_000_000_000 },
      });
    });
    render(<PhaseNotice />);

    expect(screen.getByRole("status").textContent).toContain(
      "Focus session complete",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("dismisses itself after a few seconds", () => {
    vi.useFakeTimers();
    act(() => {
      useTimerStore.setState({
        phaseNotice: { phase: "short", at: 1_700_000_000_000 },
      });
    });
    render(<PhaseNotice />);
    expect(screen.getByRole("status").textContent).toContain(
      "Short break over",
    );

    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("DESIGN.md holds on the new chrome", () => {
  function expectNoForbiddenChrome(html: string) {
    expect(html).not.toMatch(/#f{3,6}\b/i);
    expect(html).not.toMatch(/\b(text|bg|border|fill|stroke)-white\b/);
  }

  function expectNoSectioningLine(container: HTMLElement) {
    const classes = Array.from(container.querySelectorAll("*")).flatMap(
      (el) => Array.from(el.classList),
    );
    const onePixelLines = classes.filter(
      (cls) =>
        /^border(-(t|r|b|l|x|y))$/.test(cls) ||
        /^divide-/.test(cls) ||
        cls === "hr",
    );
    expect(onePixelLines).toEqual([]);
    expect(container.querySelector("hr")).toBeNull();
  }

  it("badge, dialog and notice use no pure white and no 1px dividers", () => {
    mockQuery.mockReturnValue(5);
    const badge = render(<StreakBadge />);
    expectNoForbiddenChrome(badge.container.innerHTML);
    expectNoSectioningLine(badge.container);
    cleanup();

    mockQuery.mockReturnValue(SERVER_SETTINGS);
    openDialog();
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expectNoForbiddenChrome(dialog.outerHTML);
    expectNoSectioningLine(dialog);
    // The chrome reads in JetBrains Mono — digits and statuschrome alike.
    expect(dialog.className).toContain("font-mono");
    cleanup();

    act(() => {
      useTimerStore.setState({
        phaseNotice: { phase: "focus", at: 1_700_000_000_000 },
      });
    });
    const notice = render(<PhaseNotice />);
    expectNoForbiddenChrome(notice.container.innerHTML);
    expectNoSectioningLine(notice.container);
  });
});

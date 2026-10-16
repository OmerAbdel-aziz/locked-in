import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, initialTimerState } from "@/lib/pomodoro";
import {
  ensurePermissionOnFirstStart,
  hasRequestedNotificationPermission,
  notifyPhaseEnd,
  phaseEndMessage,
  resetNotificationRequestState,
} from "@/lib/notify";
import { useTimerStore } from "@/lib/store/timer";

/**
 * Task 17 gate: browser notifications + the store wiring.
 *
 * The permission prompt fires on the first Start press — never on load,
 * never twice — and a denied (or missing) Notification API is an in-app
 * signal, never a crash. The last block proves Task 16's half of the
 * wiring: settings the dialog saves are the numbers the engine's next
 * transition actually uses, with no reload in between.
 */

const MIN = 60_000;
const T0 = 1_700_000_000_000;

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

interface NotificationStub {
  requestPermission: ReturnType<typeof vi.fn>;
  shown: { title: string; options?: NotificationOptions }[];
}

/** Installs a `Notification` double with the given standing permission. */
function stubNotification(
  permission: NotificationPermission,
): NotificationStub {
  const stub: NotificationStub = {
    requestPermission: vi.fn(async () => permission),
    shown: [],
  };
  const shown = stub.shown;
  const requestPermission = stub.requestPermission;
  class FakeNotification {
    static permission: NotificationPermission = permission;
    static requestPermission = requestPermission;
    constructor(title: string, options?: NotificationOptions) {
      shown.push({ title, options });
    }
  }
  vi.stubGlobal("Notification", FakeNotification);
  return stub;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  resetNotificationRequestState();
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the permission prompt", () => {
  it("is never requested on load", () => {
    const stub = stubNotification("default");

    // Importing the module and sitting idle must not touch the API.
    expect(hasRequestedNotificationPermission()).toBe(false);
    expect(stub.requestPermission).not.toHaveBeenCalled();
  });

  it("prompts on the first Start and never again", async () => {
    const stub = stubNotification("default");

    act(() => useTimerStore.getState().start());
    await vi.runAllTimersAsync();
    expect(stub.requestPermission).toHaveBeenCalledTimes(1);

    act(() => useTimerStore.getState().reset());
    act(() => useTimerStore.getState().start());
    await vi.runAllTimersAsync();
    expect(stub.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("does not prompt when notifications are turned off", async () => {
    const stub = stubNotification("default");
    useTimerStore.setState({ notificationsEnabled: false });

    act(() => useTimerStore.getState().start());
    await vi.runAllTimersAsync();

    expect(stub.requestPermission).not.toHaveBeenCalled();
    expect(hasRequestedNotificationPermission()).toBe(false);
  });

  it("does not prompt when permission is already decided", async () => {
    for (const permission of ["granted", "denied"] as const) {
      resetNotificationRequestState();
      const stub = stubNotification(permission);

      expect(await ensurePermissionOnFirstStart(true)).toBe(permission);
      expect(stub.requestPermission).not.toHaveBeenCalled();
    }
  });

  it("treats a missing Notification API as unsupported, not an error", async () => {
    expect(await ensurePermissionOnFirstStart(true)).toBe("unsupported");
    expect(hasRequestedNotificationPermission()).toBe(false);
  });
});

describe("the phase-end notification", () => {
  it("names each ended phase in a calm voice", () => {
    expect(phaseEndMessage("focus").title).toBe("Focus session complete");
    expect(phaseEndMessage("short").title).toBe("Short break over");
    expect(phaseEndMessage("long").title).toBe("Long break over");
  });

  it("shows when granted, stays silent otherwise — never throwing", () => {
    const granted = stubNotification("granted");
    expect(notifyPhaseEnd("focus", true)).toBe(true);
    expect(granted.shown).toHaveLength(1);
    expect(granted.shown[0].title).toBe("Focus session complete");
  });

  it("is skipped when off, denied, undecided, or unsupported", () => {
    expect(notifyPhaseEnd("focus", false)).toBe(false);

    const denied = stubNotification("denied");
    expect(notifyPhaseEnd("focus", true)).toBe(false);
    expect(denied.shown).toHaveLength(0);

    const undecided = stubNotification("default");
    expect(notifyPhaseEnd("focus", true)).toBe(false);
    expect(undecided.shown).toHaveLength(0);

    expect(notifyPhaseEnd("focus", true)).toBe(false);
  });
});

describe("the store wiring", () => {
  function runningFocus(): void {
    useTimerStore.setState({
      state: {
        phase: "focus",
        cyclePosition: 1,
        status: "running",
        phaseEndsAt: T0 + 25 * MIN,
        pausedAt: null,
        startedAt: T0,
      },
    });
  }

  it("records an in-app notice on every completion, notification or not", () => {
    stubNotification("denied");
    runningFocus();

    // Denied permission: no crash, the cycle still advances, and the
    // in-app signal is still there to be seen.
    expect(() => act(() => useTimerStore.getState().complete())).not.toThrow();
    expect(useTimerStore.getState().state.phase).toBe("short");
    expect(useTimerStore.getState().phaseNotice).toEqual({
      phase: "focus",
      at: T0,
    });
  });

  it("shows the browser notification when granted", () => {
    const stub = stubNotification("granted");
    runningFocus();

    act(() => useTimerStore.getState().complete());

    expect(stub.shown).toHaveLength(1);
    expect(useTimerStore.getState().phaseNotice?.phase).toBe("focus");
  });

  it("clears the notice on start and on dismiss", () => {
    stubNotification("denied");
    runningFocus();
    act(() => useTimerStore.getState().complete());
    expect(useTimerStore.getState().phaseNotice).not.toBeNull();

    act(() => useTimerStore.getState().dismissNotice());
    expect(useTimerStore.getState().phaseNotice).toBeNull();

    act(() => useTimerStore.getState().complete());
    act(() => useTimerStore.getState().start());
    expect(useTimerStore.getState().phaseNotice).toBeNull();
  });
});

describe("settings drive the next transition without a reload", () => {
  it("a new focus duration sizes the next started phase", () => {
    act(() => useTimerStore.getState().setSettings({ focusMin: 50 }));
    act(() => useTimerStore.getState().start());

    expect(useTimerStore.getState().state.phaseEndsAt).toBe(T0 + 50 * MIN);
  });

  it("a new session count re-times the long break", () => {
    useTimerStore.setState({
      state: {
        phase: "focus",
        cyclePosition: 4,
        status: "running",
        phaseEndsAt: T0 + 25 * MIN,
        pausedAt: null,
        startedAt: T0,
      },
    });

    // Four of four earns the long break under the defaults…
    act(() => useTimerStore.getState().complete());
    expect(useTimerStore.getState().state.phase).toBe("long");

    // …but after widening the cycle to five, session 4 earns a short one.
    resetStore();
    act(() => useTimerStore.getState().setSettings({ sessionCount: 5 }));
    useTimerStore.setState({
      state: {
        phase: "focus",
        cyclePosition: 4,
        status: "running",
        phaseEndsAt: T0 + 25 * MIN,
        pausedAt: null,
        startedAt: T0,
      },
    });
    act(() => useTimerStore.getState().complete());
    const { phase, cyclePosition } = useTimerStore.getState().state;
    expect(phase).toBe("short");
    expect(cyclePosition).toBe(5);
  });

  it("auto-start toggles take effect on the very next completion", () => {
    useTimerStore.setState({
      state: {
        phase: "focus",
        cyclePosition: 1,
        status: "running",
        phaseEndsAt: T0 + 25 * MIN,
        pausedAt: null,
        startedAt: T0,
      },
    });

    // Default: the break auto-starts.
    act(() => useTimerStore.getState().complete());
    expect(useTimerStore.getState().state.status).toBe("running");

    // Turned off mid-run: the next completion waits for the user instead.
    resetStore();
    act(() => useTimerStore.getState().setSettings({ autoStartBreak: false }));
    useTimerStore.setState({
      state: {
        phase: "focus",
        cyclePosition: 2,
        status: "running",
        phaseEndsAt: T0 + 25 * MIN,
        pausedAt: null,
        startedAt: T0,
      },
    });
    act(() => useTimerStore.getState().complete());
    const after = useTimerStore.getState().state;
    expect(after.phase).toBe("short");
    expect(after.status).toBe("idle");
  });
});

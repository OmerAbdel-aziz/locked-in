import { cleanup, render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusFooter } from "@/components/chrome/status-footer";

/**
 * Audit gate (2026-10-16): the footer shows real local time + connection
 * status (PRD §4.1), never the design's placeholder chrome. Both values
 * mount-gate through effects, so the server render they replace never
 * reads a clock.
 *
 * RTL flushes effects during render, so the "before mount" placeholder is
 * not observable here — what is pinned is that the mounted footer reports
 * the device clock (not a hard-coded string) and tracks the online events.
 */

const SET_TIME = new Date(2026, 9, 16, 14, 5, 0);

function expectedTime(): string {
  return SET_TIME.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

let online = true;

beforeEach(() => {
  online = true;
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => online,
  });
  vi.useFakeTimers();
  vi.setSystemTime(SET_TIME);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the status footer", () => {
  it("shows the real local time, not a placeholder", () => {
    render(<StatusFooter />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(`Local Time: ${expectedTime()}`)).toBeTruthy();
    expect(screen.queryByText("Local Time: 14:00")).toBeNull();
  });

  it("reports the connection honestly", () => {
    render(<StatusFooter />);
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByText("Locked In Status: Online")).toBeTruthy();

    act(() => {
      online = false;
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText("Locked In Status: Offline")).toBeTruthy();

    act(() => {
      online = true;
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByText("Locked In Status: Online")).toBeTruthy();
  });
});

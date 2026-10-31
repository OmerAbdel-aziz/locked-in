import { describe, expect, it } from "vitest";

import { paceStatus } from "@/lib/pace";

describe("pace", () => {
  it("on-track when actual meets plan", () => {
    const r = paceStatus({
      planHours: 2,
      actualMinutes: 120,
      lastBoundMs: Date.now(),
      nowMs: Date.now(),
    });
    expect(r.status).toBe("on-track");
  });

  it("at-risk when between half and full", () => {
    const now = Date.now();
    const r = paceStatus({
      planHours: 2,
      actualMinutes: 90,
      lastBoundMs: now,
      nowMs: now,
    });
    expect(r.status).toBe("at-risk");
  });

  it("stalled when no bound session for two weeks", () => {
    const now = Date.now();
    const r = paceStatus({
      planHours: 2,
      actualMinutes: 0,
      lastBoundMs: now - 15 * 24 * 60 * 60 * 1000,
      nowMs: now,
    });
    expect(r.status).toBe("stalled");
  });

  it("no plan → on-track", () => {
    const now = Date.now();
    const r = paceStatus({
      planHours: null,
      actualMinutes: 0,
      lastBoundMs: null,
      nowMs: now,
    });
    expect(r.status).toBe("on-track");
  });
});

export type PaceStatus = "on-track" | "at-risk" | "stalled";

export interface PaceInput {
  planHours: number | null;
  actualMinutes: number;
  lastBoundMs: number | null;
  nowMs: number;
}

export interface PaceResult {
  status: PaceStatus;
  planMinutes: number;
  actualMinutes: number;
  ratio: number;
}

const STALLED_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export function paceStatus(input: PaceInput): PaceResult {
  const planMinutes = (input.planHours ?? 0) * 60;
  const ratio = planMinutes > 0 ? input.actualMinutes / planMinutes : 1;

  if (input.planHours === null || input.planHours <= 0) {
    return { status: "on-track", planMinutes: 0, actualMinutes: input.actualMinutes, ratio: 1 };
  }

  const stalled =
    input.lastBoundMs === null ||
    input.nowMs - input.lastBoundMs > STALLED_AFTER_MS;

  if (stalled && input.actualMinutes === 0) {
    return { status: "stalled", planMinutes, actualMinutes: input.actualMinutes, ratio };
  }
  if (ratio >= 1) {
    return { status: "on-track", planMinutes, actualMinutes: input.actualMinutes, ratio };
  }
  if (ratio >= 0.5) {
    return { status: "at-risk", planMinutes, actualMinutes: input.actualMinutes, ratio };
  }
  // below half: stalled if no recent bound session, else at-risk
  return {
    status: stalled ? "stalled" : "at-risk",
    planMinutes,
    actualMinutes: input.actualMinutes,
    ratio,
  };
}

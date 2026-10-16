/**
 * Browser notifications — Task 17 (PRD §4.1).
 *
 * Two rules shape this module, both from the acceptance criteria:
 *
 *   - **Permission is requested on the first Start press, never on load,
 *     never twice.** The store calls `ensurePermissionOnFirstStart` from its
 *     `start()` action — an event handler, never render — and this module
 *     remembers whether it has ever asked. A second call is a read, not a
 *     prompt.
 *   - **Denial is not an error.** A denied (or unsupported) Notification API
 *     means the phase end is signalled in-app only — the store records every
 *     completion in `phaseNotice` regardless, and the timer transition never
 *     waits on, throws from, or depends on this module.
 *
 * Nothing here touches React or the clock: `Notification` is only ever
 * reached inside a function body, so server prerenders and jsdom (where the
 * API does not exist) simply take the "unsupported" path.
 */

import type { Phase } from "./pomodoro";

/** Whether the user has ever been asked in this page lifetime. */
let permissionRequested = false;

/** Resets the once-ever flag. Tests only — production never re-asks. */
export function resetNotificationRequestState(): void {
  permissionRequested = false;
}

/** For tests: has this page lifetime asked yet? */
export function hasRequestedNotificationPermission(): boolean {
  return permissionRequested;
}

type PermissionOutcome = "granted" | "denied" | "unsupported" | "deferred";

/**
 * The first-Start permission prompt. Safe to call from every `start()`:
 * only the first call with notifications on and an undecided permission can
 * possibly prompt. Everything else — already decided, already asked,
 * unsupported browser, user opted out — returns without touching the API.
 */
export async function ensurePermissionOnFirstStart(
  notificationsEnabled: boolean,
): Promise<PermissionOutcome> {
  if (!notificationsEnabled || permissionRequested) {
    return "deferred";
  }
  if (typeof Notification === "undefined") {
    return "unsupported";
  }
  if (Notification.permission === "granted") {
    return "granted";
  }
  if (Notification.permission === "denied") {
    return "denied";
  }

  permissionRequested = true;
  try {
    return (await Notification.requestPermission()) === "granted"
      ? "granted"
      : "denied";
  } catch {
    // A prompt that throws (detached document, test double) is a refusal
    // by another name — never a crash, never a second prompt.
    return "denied";
  }
}

/** The phase-end message, in the app's calm voice — no celebration gate. */
export function phaseEndMessage(ended: Phase): { title: string; body: string } {
  switch (ended) {
    case "focus":
      return {
        title: "Focus session complete",
        body: "Your break is ready when you are.",
      };
    case "short":
      return {
        title: "Short break over",
        body: "Ready for the next focus session?",
      };
    case "long":
      return {
        title: "Long break over",
        body: "Ready for the next focus session?",
      };
  }
}

/**
 * Fires the phase-end notification. Returns whether one was actually shown:
 * `false` covers off, unsupported, denied, and undecided alike — the caller
 * does not distinguish, because the in-app signal fires either way.
 */
export function notifyPhaseEnd(
  ended: Phase,
  notificationsEnabled: boolean,
): boolean {
  if (!notificationsEnabled) {
    return false;
  }
  if (typeof Notification === "undefined") {
    return false;
  }
  if (Notification.permission !== "granted") {
    return false;
  }
  const { title, body } = phaseEndMessage(ended);
  try {
    new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

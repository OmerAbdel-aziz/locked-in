/**
 * Locale-free formatters for the stats views (ADR-006).
 *
 * Moved out of the hand-rolled views they used to live in - server and
 * client must print the same strings (fixed formats, never the runtime
 * locale), the same rule the history list has always followed.
 */

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const MS_PER_MINUTE = 60_000;

/** `HH:MM` of an instant seen from the given UTC offset. */
export function formatLocalTime(
  instant: number,
  tzOffsetMinutes: number,
): string {
  const shifted = new Date(instant + tzOffsetMinutes * 60_000);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(
    shifted.getUTCMinutes(),
  ).padStart(2, "0")}`;
}

/** `Sat, Jun 1` for a `YYYY-MM-DD` day key - the history day heading. */
export function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${names[weekday]}, ${MONTHS[month - 1]} ${day}`;
}

/** `Tue, Jun 1` - full bar label for a scrubbed day. */
export function dayFull(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${names[weekday]}, ${MONTHS[month - 1]} ${day}`;
}

/** `Jun 1` without the weekday - chart bar labels. */
export function dayShort(dayKey: string): string {
  const [, month, day] = dayKey.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/** `Jun 1 - Jun 14` (same-month collapse off; cheap and unambiguous). */
export function periodLabel(days: { dayKey: string }[]): string {
  if (days.length === 0) {
    return "No days";
  }
  return `${dayShort(days[0].dayKey)} - ${dayShort(
    days[days.length - 1].dayKey,
  )}`;
}

/** Focus minutes: `45m` under an hour, `2.5h` after it. Non-integer-safe. */
export function formatMinutes(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  return `${(minutes / 60).toFixed(1)}h`;
}

/** Whole minutes spelled out - history rows: `25 min`. */
export function formatMinutesLong(minutes: number): string {
  return `${minutes} min`;
}

/** Stable series color per project key - the donut rule (PRD D-log). */
export function seriesColorFor(key: string): string {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return `var(--series-${(hash % 4) + 1})`;
}

/**
 * Time-of-day distribution — Task 21, PRD §4.1 "which hours of the day the
 * user focuses most (derived from `startedAt`, no timezone guessing — use
 * recorded offsets)".
 *
 * A 24-bar histogram over the local hour each focus session *started* in,
 * converted with that session's recorded offset (the bucketing itself lives
 * in `timeOfDayHistogram`, tested against cross-timezone fixtures). The peak
 * hour renders full-strength; every other hour renders the same hue at low
 * opacity — emphasis without a leaderboard. Pure view, no hooks.
 */

export function TimeOfDayView({ hours }: { hours: number[] }) {
  const peak = Math.max(0, ...hours);
  const peakHour = hours.indexOf(peak);

  return (
    <div className="rounded-2xl bg-surface-container-low/30 p-5">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        Time of day
      </p>
      <p className="mb-3 text-sm text-on-surface-variant">
        {peak === 0 ? (
          "No focus yet in this range"
        ) : (
          <>
            Peak hour{" "}
            <span className="font-mono font-bold text-on-surface">
              {String(peakHour).padStart(2, "0")}:00
            </span>
          </>
        )}
      </p>
      <svg
        viewBox="0 0 240 76"
        className="w-full"
        role="img"
        aria-label={
          peak === 0
            ? "No focus sessions in this range"
            : `Most focus starts at ${String(peakHour).padStart(2, "0")}:00`
        }
      >
        {hours.map((count, hour) => {
          const height = peak === 0 ? 0 : (count / peak) * 56;
          return (
            <g key={hour}>
              <title>{`${String(hour).padStart(2, "0")}:00 — ${count} sessions`}</title>
              <rect
                x={hour * 10 + 2}
                y={58 - height}
                width={6}
                height={Math.max(height, 0)}
                rx={2}
                style={{ fill: "var(--chart-3)" }}
                opacity={peak !== 0 && hour === peakHour ? 1 : 0.3}
                data-hour={hour}
                data-bar-height={Math.round(height * 100) / 100}
              />
              {hour % 6 === 0 && (
                <text
                  x={hour * 10 + 5}
                  y={72}
                  textAnchor="middle"
                  fontSize="8"
                  style={{ fill: "var(--muted)" }}
                >
                  {String(hour).padStart(2, "0")}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

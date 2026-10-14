/**
 * The progress ring — Task 7.
 *
 * The signature element of the design (DESIGN.md §5): a track plus a
 * progress stroke, `round` caps to soften the technical aesthetic, and a
 * `primary` gradient for progress rather than a flat fill.
 *
 * The design ships only a *paused* screen, in which the ring is a complete
 * muted circle (ADR-004). The running state is derived from it: same ring,
 * but the stroke becomes the gradient and its length tracks progress. Idle
 * keeps the design's full muted circle, because at rest nothing has been
 * spent and the whole session is still ahead.
 *
 * The viewBox is sized to the ring's canonical 448px (`max-w-md`), so a
 * stroke width of 4 renders as the 4px the design specifies, and scales
 * proportionally at other widths.
 */

const SIZE = 448;
const CENTER = SIZE / 2;
/** `r="48%"` in the design source. */
const RADIUS = SIZE * 0.48;
const STROKE = 4;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type RingVariant = "idle" | "paused" | "running";

export interface ProgressRingProps {
  variant: RingVariant;
  /** 0..1 elapsed fraction of the current phase. */
  progress: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

export function ProgressRing({ variant, progress }: ProgressRingProps) {
  // Idle shows the full circle the design's paused screen ships; running and
  // paused reveal only what has actually elapsed.
  const fraction = variant === "idle" ? 1 : clamp01(progress);
  const offset = CIRCUMFERENCE * (1 - fraction);
  const stroke =
    variant === "running"
      ? "url(#ring-progress-gradient)"
      : "var(--color-surface-container-highest)";

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="absolute inset-0 h-full w-full -rotate-90"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* The 145°-family gradient from the signature CTA, expressed for
            SVG. Rotated with the ring so it reads consistently. */}
        <linearGradient id="ring-progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-primary-container)" />
        </linearGradient>
      </defs>

      {/* Track: surface-container-highest at 10%, per DESIGN.md §5. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke="var(--color-surface-container-highest)"
        strokeOpacity={0.1}
        strokeWidth={STROKE}
      />

      <circle
        cx={CENTER}
        cy={CENTER}
        r={RADIUS}
        fill="none"
        stroke={stroke}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

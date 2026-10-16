/**
 * Row icons — Task 10.
 *
 * The design draws these from Material Symbols, but that family is absent
 * from `next/font/google`'s catalog (Task 2) and pulling it would add a
 * multi-megabyte external stylesheet for three glyphs. They are drawn as
 * plain geometry instead — a cross, a tick, six dots — which is exact at any
 * size, inherits `currentColor` like the text beside it, and needs no
 * network. Task 7 made the same call for the timer.
 *
 * Every icon is decorative: `aria-hidden`, with the meaning carried by the
 * control it sits in.
 */

interface IconProps {
  className?: string;
}

/** The `add` glyph in the inline input. */
export function AddIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="5" y="11" width="14" height="2" />
      <rect x="11" y="5" width="2" height="14" />
    </svg>
  );
}

/** The `check` glyph on a completed task's checkbox. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="5 12.5 9.5 17 19 6.5" />
    </svg>
  );
}

/**
 * The `drag_indicator` handle: two columns of three dots, revealed on hover
 * per the design (`opacity-0 group-hover:opacity-40`). Drawn as circles
 * rather than a path so the spacing stays even at 14px.
 */
export function DragHandleIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      {[6, 12, 18].map((y) =>
        [9, 15].map((x) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.7" />
        )),
      )}
    </svg>
  );
}

/**
 * The `edit` glyph (Phase 9): a pencil — diagonal shaft with a tip band.
 * Revealed on hover beside the drag handle, same treatment.
 */
export function EditIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 20h4L20 8l-4-4L4 16v4z" />
      <path d="M14 6l4 4" />
    </svg>
  );
}

/**
 * The `delete` glyph (Phase 9): a trash can — lid line, body, two inner
 * strokes. Same hover reveal as the handle and the pencil.
 */
export function TrashIcon({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </svg>
  );
}

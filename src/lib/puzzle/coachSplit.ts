/**
 * Center/right resizable split on /puzzles — PR-5 of
 * docs/PUZZLE_TRAINING_LAYOUT_SPEC.md ("a 6-dot vertical grip sits in the
 * gutter — the center/right split is user-resizable").
 *
 * Pure math only; the pointer plumbing lives in puzzles.tsx. Everything is a
 * function of (desired px, grid width) so the same clamp serves dragging,
 * keyboard resizing, and re-validating a stored width on a smaller screen.
 */

/** Narrower than this and the coach composer wraps into uselessness. */
export const COACH_MIN_PX = 340;

/** Wider than this buys nothing — the transcript column caps its own line length. */
export const COACH_MAX_PX = 640;

/**
 * The coach may never take more than this share of the grid, whatever the
 * stored pixel value says — a width dragged out on a 27" monitor must not
 * crush the board column on the laptop the same localStorage follows you to.
 * Mirrored in CSS by coachTrack()'s clamp() upper bound so window resizes
 * are handled without JS.
 */
export const COACH_MAX_FRACTION = 0.42;

/** Arrow-key step for the keyboard path on the separator. */
export const COACH_STEP_PX = 24;

/**
 * The track used until the user first resizes (null stored width) — the
 * fixed track the grip replaced, kept so an untouched layout is pixel-for-pixel
 * what shipped before PR-5.
 */
export const DEFAULT_COACH_TRACK = "minmax(380px, 30%)";

export function maxCoachWidth(gridWidth: number): number {
  return Math.max(
    COACH_MIN_PX,
    Math.min(COACH_MAX_PX, Math.round(gridWidth * COACH_MAX_FRACTION)),
  );
}

export function clampCoachWidth(px: number, gridWidth: number): number {
  if (!Number.isFinite(px)) return COACH_MIN_PX;
  return Math.min(maxCoachWidth(gridWidth), Math.max(COACH_MIN_PX, Math.round(px)));
}

/**
 * Width while dragging. The coach column is on the RIGHT, so moving the
 * pointer left (currentX < startX) widens it.
 */
export function dragCoachWidth(
  startWidth: number,
  startX: number,
  currentX: number,
  gridWidth: number,
): number {
  return clampCoachWidth(startWidth + (startX - currentX), gridWidth);
}

export function stepCoachWidth(
  currentWidth: number,
  direction: "wider" | "narrower",
  gridWidth: number,
): number {
  const delta = direction === "wider" ? COACH_STEP_PX : -COACH_STEP_PX;
  return clampCoachWidth(currentWidth + delta, gridWidth);
}

/**
 * The grid-template-columns track for the coach column.
 *
 * A stored width renders as clamp() rather than a bare px so the
 * COACH_MAX_FRACTION cap keeps holding through window resizes CSS sees but
 * React never does. clamp()'s % resolves against the grid container, same
 * basis maxCoachWidth() uses.
 */
export function coachTrack(width: number | null): string {
  if (width == null) return DEFAULT_COACH_TRACK;
  return `clamp(${COACH_MIN_PX}px, ${Math.round(width)}px, ${COACH_MAX_FRACTION * 100}%)`;
}

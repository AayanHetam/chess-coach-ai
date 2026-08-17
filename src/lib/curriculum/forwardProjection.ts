import { effectiveWeeklyHours, ratingAfterWeeks } from "./improvementModel";

/**
 * Extend a rating history forward to the goal date.
 *
 * The trend panels show where each control HAS been. This adds where it could
 * go — the same question the onboarding projection answers, asked of the number
 * the user actually watches.
 *
 * THE CURVE IS CONCAVE, and that is the entire point of routing it through
 * `ratingAfterWeeks` rather than drawing a line to the target. Each further
 * rating point costs more than the last, so gains are fast at first and
 * flatten. A straight line would promise late progress at the early rate, which
 * is exactly the false expectation that makes people quit at the plateau.
 *
 * PER-CONTROL, not one shared curve. A goal is a single number, but bullet,
 * blitz and rapid start from different ratings and the cost of a point depends
 * on where you are — so the same practice buys fewer points on the 1900 control
 * than the 1200 one. Projecting all three to the same target would be a drawn
 * claim we have no basis for.
 */

/** Rounded so the chart's own tick labels stay stable across renders. */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export interface ProjectedPoint {
  t: number;
  /** Present on history points only. */
  rating?: number;
  /** Present on projected points only, so the two render as separate series. */
  projected?: number;
}

export interface ForwardProjectionInput {
  /** Where this control actually is now. */
  currentRating: number;
  minutesPerDay: number;
  daysPerWeek: number;
  /** Epoch ms to project from — normally now. */
  fromMs: number;
  /** Epoch ms to project to — the goal's target date. */
  toMs: number;
  /** How many points to draw. More is smoother; 8 is plenty at this size. */
  steps?: number;
}

/**
 * Points from `fromMs` to `toMs`. Empty when there is nothing honest to draw:
 * no schedule, a target date in the past, or a non-finite rating.
 *
 * The first point is always the current rating at `fromMs`, so the projection
 * joins the history line rather than floating away from it.
 */
export function forwardProjection({
  currentRating,
  minutesPerDay,
  daysPerWeek,
  fromMs,
  toMs,
  steps = 8,
}: ForwardProjectionInput): ProjectedPoint[] {
  if (!Number.isFinite(currentRating)) return [];
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) return [];
  if (toMs <= fromMs) return [];

  const weekly = effectiveWeeklyHours(minutesPerDay, daysPerWeek);
  // No stated schedule means no basis for a curve. A flat line to the target
  // date would still read as a forecast, so draw nothing at all.
  if (weekly <= 0) return [];

  const totalWeeks = (toMs - fromMs) / MS_PER_WEEK;
  const out: ProjectedPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const weeks = (totalWeeks * i) / steps;
    out.push({
      t: Math.round(fromMs + weeks * MS_PER_WEEK),
      projected: Math.round(ratingAfterWeeks(currentRating, weeks, weekly)),
    });
  }
  return out;
}

/**
 * Stitch history and projection into one series for recharts.
 *
 * They are kept in SEPARATE keys (`rating` vs `projected`) so the chart can
 * draw measured history solid and the forecast dashed. Merging them into one
 * key would render a single continuous line, which would present a projection
 * with exactly the same visual authority as a measurement — the reader has no
 * way to tell which part actually happened.
 *
 * The join point carries BOTH keys, otherwise recharts breaks the two lines
 * apart and leaves a visible gap where they should meet.
 */
export function stitchProjection(
  history: { t: number; rating: number }[],
  projection: ProjectedPoint[]
): ProjectedPoint[] {
  if (projection.length === 0) return history.map((h) => ({ ...h }));
  const out: ProjectedPoint[] = history.map((h) => ({ ...h }));
  const last = out[out.length - 1];
  const [head, ...rest] = projection;
  if (last && head) {
    // Anchor the forecast to the final measurement so the lines touch.
    last.projected = last.rating;
    // When the forecast starts LATER than the last recorded game — the normal
    // case, since the projection runs from today — keep its first point.
    // Dropping it would let the chart interpolate straight from the last game
    // to the first forecast step, drawing the silent weeks in between as
    // gains. The gap has to render flat: nothing was measured there.
    if (head.t !== last.t) out.push(head);
  } else if (head) {
    out.push(head);
  }
  out.push(...rest);
  return out;
}

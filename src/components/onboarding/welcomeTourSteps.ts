/**
 * Pure step logic for the WelcomeTour, kept out of the component file so it
 * can be unit-tested in the repo's node vitest environment (no DOM, and no
 * auth context to mount).
 */

/** The tour's cards, in tour order — deliberately not nav order: solve now,
 *  understand your games, then meet the plan that strings the habit together. */
export const TOUR_STEP_ORDER = ["Practice", "Analyze", "Plan"] as const;

export type TourNavLabel = (typeof TOUR_STEP_ORDER)[number];

// Where each surface lives in the tour, so the first card describes the tab
// the visitor is actually standing on. A QA pass on 2026-09-05 opened the
// tour on /play and read its Practice card as "wrong tour content". Surfaces
// with no card of their own (Play, Learn, Scout) still start from the loop's
// first step.
const SURFACE_STEP: ReadonlyArray<readonly [prefix: string, label: TourNavLabel]> =
  [
    ["/plan", "Plan"],
    ["/analysis", "Analyze"],
    ["/puzzles", "Practice"],
    ["/practice", "Practice"],
  ];

/** Index into TOUR_STEP_ORDER to open on for `pathname`; 0 when nothing matches. */
export function initialTourStep(pathname: string): number {
  const match = SURFACE_STEP.find(
    ([p]) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (!match) return 0;
  const idx = TOUR_STEP_ORDER.indexOf(match[1]);
  return idx >= 0 ? idx : 0;
}

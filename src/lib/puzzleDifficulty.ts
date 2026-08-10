/**
 * "New puzzle ⌄" difficulty stepping.
 *
 * Extracted from puzzles.tsx because the band math has three easy-to-get-wrong
 * cases — the "Any" band isn't a difficulty, the current puzzle's rating may
 * fall outside every band's range, and stepping past either end must not wrap.
 */

export interface DifficultyBand {
  id: string;
  min: number;
  max: number;
}

/**
 * Resolve which band a "one step easier / harder" request lands on.
 *
 * @param bands   Real difficulty bands, ascending. Must NOT include a catch-all
 *                "any" band — filter it out before calling.
 * @param activeBandId  Currently selected band id, or an id not in `bands`
 *                      (e.g. "all") when the user hasn't picked one.
 * @param currentRating Rating of the puzzle on the board, used to locate a
 *                      starting band when `activeBandId` isn't a real band.
 * @param delta   -1 easier, +1 harder.
 * @returns The band to switch to, or `null` when the request can't move —
 *          already at the floor going down, or the ceiling going up. `null`
 *          means "serve another at the current difficulty" rather than
 *          silently doing nothing.
 */
export function stepDifficulty(
  bands: DifficultyBand[],
  activeBandId: string,
  currentRating: number,
  delta: -1 | 1,
): DifficultyBand | null {
  if (bands.length === 0) return null;

  let idx = bands.findIndex((b) => b.id === activeBandId);
  if (idx === -1) {
    idx = bands.findIndex(
      (b) => currentRating >= b.min && currentRating <= b.max,
    );
    // Rating outside every band — clamp to the nearest end rather than
    // defaulting to the easiest, which would yank a strong player down.
    if (idx === -1) idx = currentRating < bands[0].min ? 0 : bands.length - 1;
  }

  const next = idx + delta;
  if (next < 0 || next >= bands.length) return null;
  return bands[next];
}

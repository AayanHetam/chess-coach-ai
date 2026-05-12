export type QualitativeBand =
  | "losing"
  | "much_worse"
  | "slightly_worse"
  | "equal"
  | "slightly_better"
  | "much_better"
  | "winning";

export const BAND_ORDER: readonly QualitativeBand[] = [
  "losing",
  "much_worse",
  "slightly_worse",
  "equal",
  "slightly_better",
  "much_better",
  "winning",
];

export const ADJACENT_BAND_TOLERANCE_CP = 20;

const BAND_INDEX: Record<QualitativeBand, number> = {
  losing: 0,
  much_worse: 1,
  slightly_worse: 2,
  equal: 3,
  slightly_better: 4,
  much_better: 5,
  winning: 6,
};

const BAND_BOUNDARY_CP: Record<string, number> = {
  "losing|much_worse": -300,
  "much_worse|slightly_worse": -150,
  "slightly_worse|equal": -50,
  "equal|slightly_better": 50,
  "slightly_better|much_better": 150,
  "much_better|winning": 300,
};

/**
 * Half-open interval convention so each band is unambiguous.
 *   losing           cp ≤ -300
 *   much_worse       -300 < cp ≤ -150
 *   slightly_worse   -150 < cp ≤  -50
 *   equal             -50 < cp <   50
 *   slightly_better    50 ≤ cp <  150
 *   much_better       150 ≤ cp <  300
 *   winning           300 ≤ cp
 */
export function cpToBand(cp: number): QualitativeBand {
  if (cp <= -300) return "losing";
  if (cp <= -150) return "much_worse";
  if (cp <= -50) return "slightly_worse";
  if (cp < 50) return "equal";
  if (cp < 150) return "slightly_better";
  if (cp < 300) return "much_better";
  return "winning";
}

export function bandDistance(a: QualitativeBand, b: QualitativeBand): number {
  return Math.abs(BAND_INDEX[a] - BAND_INDEX[b]);
}

export function bandIsAdjacent(a: QualitativeBand, b: QualitativeBand): boolean {
  return bandDistance(a, b) === 1;
}

export function boundaryBetween(a: QualitativeBand, b: QualitativeBand): number | null {
  if (!bandIsAdjacent(a, b)) return null;
  const lower = BAND_INDEX[a] < BAND_INDEX[b] ? a : b;
  const higher = BAND_INDEX[a] < BAND_INDEX[b] ? b : a;
  return BAND_BOUNDARY_CP[`${lower}|${higher}`] ?? null;
}

/**
 * Adjacent-band tolerance per PR 1.B plan §4.1 (Aayan 2026-05-11: 20 cp).
 * If the LLM picks a band one step off from Stockfish and Stockfish's cp
 * is within toleranceCp of the boundary between them, treat as a tie.
 */
export function isWithinTolerance(
  stockfishCp: number,
  statedBand: QualitativeBand,
  expectedBand: QualitativeBand,
  toleranceCp: number = ADJACENT_BAND_TOLERANCE_CP
): boolean {
  if (statedBand === expectedBand) return true;
  if (!bandIsAdjacent(statedBand, expectedBand)) return false;
  const boundary = boundaryBetween(statedBand, expectedBand);
  if (boundary === null) return false;
  return Math.abs(stockfishCp - boundary) <= toleranceCp;
}

/**
 * Mate-distance to cp sentinel. Used by validators converting Stockfish
 * mate output into a comparable scalar. The exact value doesn't matter
 * beyond saturation into the winning/losing band.
 */
export const MATE_CP_SENTINEL = 10000;

export function evalToCp(eval_: { cp?: number; mate?: number }): number {
  if (eval_.mate !== undefined) {
    return eval_.mate > 0 ? MATE_CP_SENTINEL : -MATE_CP_SENTINEL;
  }
  return eval_.cp ?? 0;
}

/**
 * Pure helpers + shared types for the /calibrate rater page. Kept JSX-free so
 * they can be unit-tested under vitest's node environment without dragging in
 * MUI / react-chessboard / react-markdown.
 */

export interface CalibrationItem {
  id: string;
  fen: string;
  movePlayedSan: string;
  bestMoveSan: string;
  evalDeltaCpMoverPov: number;
  classification: string;
  userRating: number;
  tier: string;
  coachText: string;
}

export interface CalibrationData {
  items: CalibrationItem[];
}

export type DimScore = 0 | 1 | 2;
export type DimKey = "d1" | "d2" | "d3" | "d4" | "d5" | "d6" | "d7";

/** A per-item rating: any subset of the 7 dims may be filled in. */
export type ItemRating = Partial<Record<DimKey, DimScore>>;
/** All ratings for the current rater, keyed by item id. */
export type RatingsState = Record<string, ItemRating>;

export interface ExportRow extends Record<DimKey, DimScore> {
  id: string;
}
export interface ExportShape {
  rater: string;
  generatedNote: string;
  ratings: ExportRow[];
}

/** Static rubric (mirrors helpfulnessPrompt.ts SCORING ANCHORS). */
export const DIMENSIONS: { key: DimKey; label: string; rubric: string }[] = [
  {
    key: "d1",
    label: "1. Chess correctness",
    rubric:
      "Every move/claim legal & consistent with the FEN; 0 if any line contradicts the board.",
  },
  {
    key: "d2",
    label: "2. Diagnostic accuracy",
    rubric:
      "Names the specific mistake & why, matching classification + eval delta. (N/A if the move was best.)",
  },
  {
    key: "d3",
    label: "3. Insight / the “why”",
    rubric:
      "A causal idea (plan/threat/weakness) for THIS position; bare eval restatement = 0.",
  },
  {
    key: "d4",
    label: "4. Actionability",
    rubric:
      "Concrete, position-specific next step; generic advice (“develop pieces”) = 0.",
  },
  {
    key: "d5",
    label: "5. Level-appropriateness",
    rubric: "Vocabulary & depth matched to the user's rating.",
  },
  {
    key: "d6",
    label: "6. Assistance calibration",
    rubric:
      "Surfaces the idea / right question; 0 if it dumps the full engine line OR withholds to uselessness.",
  },
  {
    key: "d7",
    label: "7. Focus / non-redundancy",
    rubric: "On the key feature, length-controlled; padding/repetition = 0.",
  },
];

export const DIM_KEYS: DimKey[] = DIMENSIONS.map((d) => d.key);

/** An item is fully rated when all 7 dims are present. */
export function isItemFullyRated(rating: ItemRating | undefined): boolean {
  if (!rating) return false;
  return DIM_KEYS.every((k) => rating[k] !== undefined);
}

/**
 * Build the export payload. Only fully-rated items are included; partially
 * rated items are dropped (never zero-filled — that would corrupt calibration
 * data). Returns the payload plus the count of excluded items so the caller
 * can warn.
 */
export function buildExport(
  rater: string,
  items: CalibrationItem[],
  ratings: RatingsState
): { payload: ExportShape; excludedCount: number } {
  const rows: ExportRow[] = [];
  let excludedCount = 0;
  for (const it of items) {
    const r = ratings[it.id];
    if (!isItemFullyRated(r)) {
      excludedCount += 1;
      continue;
    }
    rows.push({
      id: it.id,
      d1: r!.d1!,
      d2: r!.d2!,
      d3: r!.d3!,
      d4: r!.d4!,
      d5: r!.d5!,
      d6: r!.d6!,
      d7: r!.d7!,
    });
  }
  const payload: ExportShape = {
    rater,
    generatedNote: `Calibrated on ${new Date().toISOString()} — ${rows.length} items`,
    ratings: rows,
  };
  return { payload, excludedCount };
}

export function formatCpDelta(cp: number): string {
  const sign = cp > 0 ? "+" : "";
  return `${sign}${cp}cp`;
}

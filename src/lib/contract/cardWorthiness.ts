/**
 * Card-worthiness — how many cards a game_review is allowed to carry, and
 * which ones earn a card at all (founder decision, 2026-08-11).
 *
 * ── The decision ───────────────────────────────────────────────────────────
 * "Cap the cards at 5 — but it is important to keep in mind that in some
 * cases only 1 or 2 should be given."
 *
 * The second half is the load-bearing half. A FIXED card count is fabrication
 * pressure with a number on it: the verbalizer is handed a card plan and told
 * to write every card in it, so a plan of five on a game containing one real
 * mistake asks the model to manufacture four lessons that the board does not
 * support. Plan §14's own measurement is the proof that the referee cannot
 * save us there — it refutes claims against the contract, and a padded card
 * IS in the contract. The cap is therefore a MAXIMUM, and the floor below is
 * what actually decides the count.
 *
 * ── Why the existing `drop > 50` gate is not a card-worthiness floor ────────
 * `selectInsights` keeps every half-move whose eval drop exceeds 50cp. That
 * is a MISTAKE-DETECTION threshold and it is right for what it does: the
 * contract should carry every mistake as a citable fact. It is the wrong
 * question for "does this deserve a teaching card", because 50cp means
 * completely different things in different positions:
 *
 *   · a 51cp drop in a position already lost by four pawns costs nothing —
 *     the game was decided long before, and a card about it teaches the user
 *     that their losing position got slightly more losing;
 *   · a 51cp drop that takes a won game to a level one costs the WHOLE point.
 *
 * So card-worthiness is scored against what the move actually cost, in
 * outcome terms, not against a flat centipawn bar.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 * Evals are read from the MOVER's perspective and bucketed into the five
 * bands a coach would name. An insight earns a card when:
 *
 *   1. the mover was NOT already lost (`LOST` before ⇒ never card-worthy —
 *      nothing left to lose, this is the founder's "already-lost" case); AND
 *   2. the move dropped the position at least one band (the boundary-crossing
 *      test — this is what makes a 51cp drop out of a won game count), OR the
 *      drop is a blunder in absolute terms (≥300cp, the same threshold
 *      `builder.ts` uses to print "blunder"), which covers throwing away a
 *      forced mate while still being winning.
 *
 * Among the qualifiers, selection is SEVERITY-FIRST with TEACHABILITY
 * breaking near-ties (plan §12 A6, resolved), then the cap.
 *
 * ── The floor can never zero out a game that had a moment ──────────────────
 * If nothing clears the floor but insights exist, the single best one is kept
 * — a review of a scrappy-but-clean game should say "here is the one moment
 * that mattered", not "nothing to see". A genuinely zero-card review happens
 * when `selectInsights` found no mistake at all (fixture 06 — a 12-ply
 * opening), and that path is the verbalizer's honest short-overview branch.
 */
import type { InsightContract } from "./types";

/** Founder decision 2026-08-11: a MAXIMUM, never a target. */
export const MAX_GAME_REVIEW_CARDS = 5;

/** The absolute-severity escape hatch — `builder.ts`'s own "blunder" bar. */
export const BLUNDER_CP = 300;

/**
 * Severity bucket width for the near-tie test. Severities inside the same
 * bucket count as equal, and teachability picks between them; severities in
 * different buckets are ordered by severity alone. Quantising (rather than
 * comparing |Δ| pairwise) keeps the comparator a total order, so the sort is
 * deterministic regardless of input order.
 */
export const SEVERITY_TIE_BUCKET_CP = 25;

/** The five bands a coach would name, ordered worst (0) to best (4). */
export type EvalBand = 0 | 1 | 2 | 3 | 4;
export const BAND_LOST: EvalBand = 0;

/** Mover-perspective centipawns → band. Mates arrive pre-flattened (±9999). */
export function evalBand(moverCp: number): EvalBand {
  if (moverCp <= -300) return 0; // LOST
  if (moverCp < -100) return 1; // WORSE
  if (moverCp < 100) return 2; // LEVEL
  if (moverCp < 300) return 3; // BETTER
  return 4; // WINNING
}

/** `cpBeforeFlat`/`cpAfterFlat` are White-positive; cards are about the mover. */
function moverCp(insight: InsightContract, which: "before" | "after"): number {
  const cp = which === "before" ? insight.cpBeforeFlat : insight.cpAfterFlat;
  return insight.color === "w" ? cp : -cp;
}

/**
 * How much a teacher can DO with this insight: confirmed motifs and tagged
 * concepts are the two structured teaching hooks the contract carries. Used
 * only to break near-ties in severity (plan §12 A6) — never to promote a
 * card over a materially worse mistake.
 */
export function teachability(insight: InsightContract): number {
  const confirmedMotifs = insight.motifs.filter((m) => m.confirmed).length;
  return confirmedMotifs + (insight.concepts?.length ?? 0);
}

export interface CardWorthiness {
  worthy: boolean;
  /** Machine-readable reason, for telemetry and for the tests. */
  reason: "already_lost" | "band_drop" | "blunder_severity" | "immaterial";
  bandBefore: EvalBand;
  bandAfter: EvalBand;
}

/** Does this insight's drop deserve a teaching card in its own position? */
export function cardWorthiness(insight: InsightContract): CardWorthiness {
  const bandBefore = evalBand(moverCp(insight, "before"));
  const bandAfter = evalBand(moverCp(insight, "after"));
  if (bandBefore === BAND_LOST) {
    return { worthy: false, reason: "already_lost", bandBefore, bandAfter };
  }
  if (bandAfter < bandBefore) {
    return { worthy: true, reason: "band_drop", bandBefore, bandAfter };
  }
  if (insight.severityDropCp >= BLUNDER_CP) {
    return { worthy: true, reason: "blunder_severity", bandBefore, bandAfter };
  }
  return { worthy: false, reason: "immaterial", bandBefore, bandAfter };
}

/** Severity-first, teachability breaking near-ties. Higher sorts first. */
export function compareCardPriority(a: InsightContract, b: InsightContract): number {
  const bucket = (i: InsightContract) => Math.floor(i.severityDropCp / SEVERITY_TIE_BUCKET_CP);
  const byBucket = bucket(b) - bucket(a);
  if (byBucket !== 0) return byBucket;
  const byTeachability = teachability(b) - teachability(a);
  if (byTeachability !== 0) return byTeachability;
  return a.ply - b.ply; // deterministic final tiebreak
}

export interface CardWorthinessSelection {
  /** The insights that earn a card, in the SAME relative order they arrived. */
  kept: InsightContract[];
  /** Dropped by the quality floor (telemetry + tests). */
  droppedBelowFloor: InsightContract[];
  /** Cleared the floor but lost the cap (telemetry + tests). */
  droppedOverCap: InsightContract[];
  /** True when the floor emptied the plan and the headline was restored. */
  headlineRestored: boolean;
}

/**
 * Apply the floor and the cap to an ALREADY-ORDERED card plan, preserving
 * that pedagogical order in the output (selection changes WHICH cards ship,
 * never the sequence they ship in — the enforced stream and the CI-5 gate
 * both assert plan order).
 */
export function selectWorthyCards(
  ordered: InsightContract[],
  max: number = MAX_GAME_REVIEW_CARDS,
): CardWorthinessSelection {
  const worthy = ordered.filter((i) => cardWorthiness(i).worthy);
  const belowFloor = ordered.filter((i) => !cardWorthiness(i).worthy);

  let headlineRestored = false;
  let pool = worthy;
  if (pool.length === 0 && ordered.length > 0) {
    // Nothing cleared the floor: keep the single best moment rather than
    // reviewing a game that did have one and saying nothing about it.
    pool = [[...ordered].sort(compareCardPriority)[0]];
    headlineRestored = true;
  }

  const ranked = [...pool].sort(compareCardPriority);
  const keptSet = new Set(ranked.slice(0, max));
  const overCap = ranked.slice(max);

  return {
    kept: ordered.filter((i) => keptSet.has(i)),
    droppedBelowFloor: belowFloor.filter((i) => !keptSet.has(i)),
    droppedOverCap: overCap,
    headlineRestored,
  };
}

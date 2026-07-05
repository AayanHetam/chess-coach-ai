import { Chess } from "chess.js";
import { compute_feature_delta } from "@/lib/mastermind/featureDelta";
import { buildThreatTree, type ThreatNode } from "@/lib/mastermind/threatTree";
import {
  candidatesFromDelta,
  selectPrimaryIdea,
  type MasterySummary,
} from "@/lib/teaching/relevanceFilter";

/**
 * Phase-4 EMT SPINE (Expectation → Misconception → Teaching) + fade-by-mastery
 * HINT LADDER.
 *
 * The multi-turn Socratic loop (in /api/chat) needs, per critical position, a
 * PRE-DERIVED plan it can carry across turns: what the student SHOULD see
 * (expectation), what they most plausibly got wrong (misconceptions), and a
 * 5-rung ladder that reveals the answer progressively (pump → hint → prompt →
 * partial → answer) instead of dumping it. This module derives all of that
 * DETERMINISTICALLY from chess.js/Stockfish facts — it reuses the SAME
 * primitives as the single-turn teaching spine (compute_feature_delta,
 * buildThreatTree, the relevanceFilter candidate taxonomy) so the Socratic
 * dialogue can never contradict the turn-1 analysis and can never introduce a
 * relational hallucination (the truthfulness floor's dim-1 stays intact by
 * construction — no LLM touches these strings).
 *
 * Everything here is PURE (same FEN/PV/mastery → same spine), so "cross-game
 * memory changes how much we scaffold" and "an empty position yields no
 * Socratic mode" are unit tests, not LLM evals.
 */

/** The five rungs of the fade ladder, from least to most revealing. */
export type HintRungKind = "pump" | "hint" | "prompt" | "partial" | "answer";

/** Numeric level for each rung — the ladder walks these in order. */
export const HINT_RUNG_LEVELS: Record<HintRungKind, number> = {
  pump: 0,
  hint: 1,
  prompt: 2,
  partial: 3,
  answer: 4,
};

const RUNG_ORDER: HintRungKind[] = ["pump", "hint", "prompt", "partial", "answer"];
const MAX_RUNG_LEVEL = RUNG_ORDER.length - 1;

export interface HintRung {
  kind: HintRungKind;
  level: number;
  /** Grounded, ready-to-deliver coaching text for this rung. */
  text: string;
}

export interface EMTMisconception {
  /** Weakness-taxonomy category, so mastery can be matched to it. */
  category: string;
  /** The anticipated wrong reasoning, grounded in the actual facts. */
  text: string;
}

export interface EMTExpectation {
  /** The single concept the student should grasp (weakness taxonomy), or null on a quiet move. */
  concept: string | null;
  /** Human-readable statement of the concept-delta the move touched. */
  conceptText: string | null;
  /** The opponent forcing replies the student must count BEFORE moving. */
  mustCount: string[];
  /** The best move in SAN (the eventual answer), or null if not derivable. */
  bestMoveSan: string | null;
}

export interface EMTSpine {
  expectation: EMTExpectation;
  misconceptions: EMTMisconception[];
  /** 5-rung ladder, ordered pump → answer. */
  hintLadder: HintRung[];
  /**
   * True when there is nothing grounded to teach (quiet move, no threats, no
   * concept-delta). Callers MUST NOT enter Socratic mode on an empty spine —
   * there is nothing to ask about.
   */
  isEmpty: boolean;
}

/** Short `Nxe5 (wins ~3p)` / `Qh5 (MATE)` phrases from the threat tree. */
function threatPhrases(nodes: ThreatNode[]): string[] {
  return nodes.slice(0, 3).map((t) => {
    const tag = t.isMate
      ? "MATE"
      : t.isCheck
        ? "check"
        : `wins ~${Math.round(t.approxMaterialGainCp / 100)}p`;
    return `${t.threatSan} (${tag})`;
  });
}

/** Convert the engine's best-move UCI to SAN from the pre-move FEN; null on any failure. */
function bestMoveToSan(fenBefore: string, bestPvUci: string[]): string | null {
  const uci = bestPvUci[0];
  if (!uci || uci.length < 4) return null;
  try {
    const game = new Chess(fenBefore);
    const res = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    return res?.san ?? null;
  } catch {
    return null;
  }
}

const EMPTY_SPINE: EMTSpine = {
  expectation: { concept: null, conceptText: null, mustCount: [], bestMoveSan: null },
  misconceptions: [],
  hintLadder: [],
  isEmpty: true,
};

/**
 * Derive the EMT spine for a single critical move. Reuses the concept-delta and
 * threat-tree primitives; the primary concept is chosen by the SAME relevance
 * filter as single-turn teaching (so cross-game memory, when supplied, steers
 * both the same way). Returns an empty spine (isEmpty:true) when the move is
 * quiet or the FEN is unusable — the caller then stays out of Socratic mode.
 *
 * `moveSan` is the move the student actually played (for framing); optional.
 * `masterySummary` re-weights the expectation concept toward a recurring
 * weakness, identical to selectPrimaryIdea's behavior elsewhere.
 */
export function deriveEMTSpine(
  fenBefore: string,
  fenAfter: string,
  bestPvUci: string[],
  moveSan?: string,
  masterySummary?: MasterySummary | null
): EMTSpine {
  let delta;
  let threatNodes: ThreatNode[];
  try {
    delta = compute_feature_delta(fenBefore, fenAfter, { pv: bestPvUci });
    threatNodes = buildThreatTree(fenBefore, 2);
  } catch {
    return EMPTY_SPINE;
  }

  const candidates = candidatesFromDelta(delta);
  const { primary } = selectPrimaryIdea(candidates, masterySummary);
  const mustCount = threatPhrases(threatNodes);
  const bestMoveSan = bestMoveToSan(fenBefore, bestPvUci);

  const expectation: EMTExpectation = {
    concept: primary?.category ?? null,
    conceptText: primary?.text ?? null,
    mustCount,
    bestMoveSan,
  };

  // Nothing grounded to teach → no Socratic mode.
  if (!primary && mustCount.length === 0) {
    return EMPTY_SPINE;
  }

  const misconceptions = deriveMisconceptions(delta, threatNodes);
  const hintLadder = buildHintLadder(expectation, misconceptions, moveSan);

  return { expectation, misconceptions, hintLadder, isEmpty: false };
}

/**
 * Anticipated wrong reasoning, each line grounded in a fact the move actually
 * changed. These are the misconceptions the coach diagnoses BEFORE correcting —
 * derived, never invented. Capped so we don't lecture.
 */
function deriveMisconceptions(
  delta: ReturnType<typeof compute_feature_delta>,
  threatNodes: ThreatNode[]
): EMTMisconception[] {
  const out: EMTMisconception[] = [];

  // Assumed a now-hanging piece was safe.
  const hung = delta.hangingPiecesDelta.newlyHanging;
  if (hung.length) {
    const h = hung[0];
    out.push({
      category: "Hanging Pieces",
      text: `You may have assumed your ${h.piece} on ${h.square} was safe — but the move left it undefended.`,
    });
  }

  // Didn't count the opponent's most forcing reply.
  const topThreat = threatNodes[0];
  if (topThreat) {
    const what = topThreat.isMate
      ? "a forced mate"
      : topThreat.isCheck
        ? "a check that wins material"
        : "a capture that wins material";
    out.push({
      category: "Missed Tactics",
      text: `You likely didn't count your opponent's reply ${topThreat.threatSan} — it sets up ${what}.`,
    });
  }

  // Focused on own plan, ignored a conceded threat.
  const newThreats = delta.threatsDelta.newThreats;
  if (newThreats.length && !topThreat) {
    out.push({
      category: "Missed Tactics",
      text: `You may have focused on your own plan and overlooked the threat it conceded: ${newThreats[0].description}.`,
    });
  }

  // King safety let go.
  const ksW = delta.kingSafetyDelta.white;
  const ksB = delta.kingSafetyDelta.black;
  if ((ksW < 0 || ksB < 0) && out.length < 2) {
    out.push({
      category: "King Safety",
      text: "You may have underrated how much this move exposed your king.",
    });
  }

  return out.slice(0, 2);
}

/**
 * Build the 5-rung fade ladder from the grounded expectation + misconceptions.
 * Each rung reveals strictly more than the one before it. Every rung's text is
 * assembled ONLY from facts already in the expectation/misconception sets, so
 * the whole ladder is engine-grounded.
 */
function buildHintLadder(
  expectation: EMTExpectation,
  misconceptions: EMTMisconception[],
  moveSan?: string
): HintRung[] {
  const moveLabel = moveSan ? `**${moveSan}**` : "that move";
  const { mustCount, conceptText, bestMoveSan } = expectation;
  const hasThreats = mustCount.length > 0;

  // PUMP — a probing question, no content revealed.
  const pump = hasThreats
    ? `Before we look at the answer: after ${moveLabel}, what can your opponent do in reply? Count their most forcing options first.`
    : `Take a second before the answer — what changed about your position after ${moveLabel}? What did it give up?`;

  // HINT — point at the relevant area, still no specifics.
  const hint = hasThreats
    ? "Focus on your opponent's most forcing tries — the checks and captures. One of them is stronger than it looks."
    : conceptText
      ? "Look at your own pieces first: something that was fine a move ago is now loose. Which one?"
      : "Look one move deeper than you did — the reply matters more than the move.";

  // PROMPT — name the concept/theme and diagnose the likely misconception.
  const diagnosis = misconceptions[0]?.text;
  const promptBits: string[] = [];
  if (conceptText) {
    promptBits.push(`This position is really about ${conceptText}.`);
  } else if (hasThreats) {
    promptBits.push("This position is about counting your opponent's forcing replies before you move.");
  }
  if (diagnosis) promptBits.push(diagnosis);
  const prompt =
    promptBits.join(" ") ||
    "Name the idea for yourself before you check: what is the one thing this move missed?";

  // PARTIAL — reveal the key concrete fact, but not the fix.
  const partial = hasThreats
    ? `Here's the key point: your opponent's ${mustCount[0]} is the reply ${moveLabel} allowed. See how it works before you look at the fix.`
    : conceptText
      ? `Here's the concrete issue: ${conceptText}. Now — what move would have avoided it?`
      : "The problem is a move-order one: the reply comes before your plan does.";

  // ANSWER — the full fix + the why.
  const answerBits: string[] = [];
  if (bestMoveSan) {
    answerBits.push(`The move was ${bestMoveSan}.`);
  }
  if (conceptText) {
    answerBits.push(`It fixes the core problem: ${conceptText}.`);
  } else if (hasThreats) {
    answerBits.push("It answers the opponent's forcing reply instead of walking into it.");
  }
  if (mustCount.length) {
    answerBits.push(`Full picture — the replies to have counted: ${mustCount.join(", ")}.`);
  }
  const answer = answerBits.join(" ") || "That was the critical moment — the reply mattered more than the move.";

  const byKind: Record<HintRungKind, string> = { pump, hint, prompt, partial, answer };
  return RUNG_ORDER.map((kind) => ({
    kind,
    level: HINT_RUNG_LEVELS[kind],
    text: byKind[kind],
  }));
}

/**
 * Map a mastery summary to a 0..1 mastery score for a concept CATEGORY. A
 * category the player struggles with repeatedly scores LOW (they need more
 * scaffolding); a category absent from their weaknesses scores neutral-high.
 * This is what makes the ladder FADE BY MASTERY: known weaknesses reveal more,
 * sooner. Returns a neutral 0.7 when there is no summary.
 */
export function masteryForCategory(
  summary: MasterySummary | null | undefined,
  category: string | null
): number {
  if (!summary || !category) return 0.7;
  const w = summary.weaknesses.find((x) => x.category === category);
  if (!w) return 0.7;
  switch (w.severity) {
    case "critical":
      return 0.1;
    case "frequent":
      return 0.3;
    case "occasional":
      return 0.5;
  }
}

export interface HintLadderState {
  /**
   * 0..1 mastery on the expectation concept (higher = knows it better). Higher
   * mastery starts the student LOWER on the ladder (more asking, less telling).
   * Omit → treated as neutral (0.7): start at PUMP.
   */
  masteryLevel?: number;
  /**
   * How many times the student has already probed THIS position (0-based). Each
   * probe walks one rung further down toward the answer, so a student who keeps
   * asking is not left stranded.
   */
  probesOnPosition?: number;
}

/**
 * Pick which rung to deliver this turn. FADE BY MASTERY: a student who has
 * mastered the concept starts at PUMP and only earns more revelation by asking
 * again; a student for whom this is a known weakness starts further up the
 * ladder so they aren't stranded. The rung then advances one step per probe,
 * clamped at ANSWER. Pure — same spine + state → same rung.
 */
export function selectHintRung(
  spine: EMTSpine,
  state: HintLadderState = {}
): HintRung | null {
  if (spine.isEmpty || spine.hintLadder.length === 0) return null;

  const mastery = clamp01(state.masteryLevel ?? 0.7);
  const probes = Math.max(0, Math.floor(state.probesOnPosition ?? 0));

  // Lower mastery → higher starting rung (more scaffolding up front).
  // >=0.6 → PUMP(0); 0.4..0.6 → HINT(1); 0.2..0.4 → PROMPT(2); <0.2 → PARTIAL(3).
  let start: number;
  if (mastery >= 0.6) start = 0;
  else if (mastery >= 0.4) start = 1;
  else if (mastery >= 0.2) start = 2;
  else start = 3;

  const level = Math.min(start + probes, MAX_RUNG_LEVEL);
  return spine.hintLadder[level];
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.7;
  return Math.max(0, Math.min(1, n));
}

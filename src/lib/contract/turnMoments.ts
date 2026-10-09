/**
 * Turn-1 key moments as moments (pathway 4.1, server).
 *
 * Under COACH_TURN1_MOMENTS the enforced stream (enforcedStream.ts) lifts
 * every card the ladder passed into a moment and sends it just before the
 * card's text, which does not change. This module is the lift.
 *
 * The prose is the card cut the way the page cuts it: `parseInsights` and
 * then `splitInsightWhy`, the two pure modules the page itself runs. The
 * Idea lines are the idea and the Problem lines what happens (a flowing
 * body's first paragraph is split at its first sentence), the closing
 * takeaway is the lesson, and Solution, Outcome and anything else the page
 * keeps behind its tap are `more`. The lede outside [WHY] is in no field.
 * `momentFromCardBody` (moment.ts) cuts a flowing body differently and is
 * not used here.
 *
 * Everything else is the contract's and never read from the text: the
 * board before the move, the move with its verdict and the header's evals,
 * and the proof as the engine's line there (`lines[0]`, eight plies, the
 * line the page draws from the same sweep). Annotations are empty for now.
 */
import { parseInsights } from "@/components/AICoachInsights.parser";
import type { InsightData } from "@/components/AICoachInsights.parser";
import { splitInsightWhy } from "@/components/preview-analysis/insightWhy";
import { cardKey } from "@/lib/coach/turnMoment";
import type { TurnMoment } from "@/lib/coach/turnMoment";
import type { MomentProof, MomentProse, ProofRef } from "@/lib/coach/moment";
import type { LadderStage } from "./ladder";
import { splitProseSentences } from "./sentences";
import type { EvalFact, InsightContract } from "./types";

/**
 * The server switch: `COACH_TURN1_MOMENTS=1` (or "on", "true"), read per
 * call. Off, nothing is lifted, sent or stored, and the review's bytes are
 * what they were.
 */
export function isTurnMomentsEnabled(): boolean {
  const v = (process.env.COACH_TURN1_MOMENTS ?? "").trim().toLowerCase();
  return v === "1" || v === "on" || v === "true";
}

/** The ladder stages whose card shipped the model's own refereed prose. */
export const LIFTED_STAGES: ReadonlySet<LadderStage> = new Set<LadderStage>([
  "pass",
  "sentence_drop",
  "edited",
  "regenerated",
]);

/** The plies of the engine's line a moment carries: engineLineAt's default. */
export const TURN_MOMENT_PROOF_PLIES = 8;

const LEAD_LABEL_RE = /^(Idea|Problem)\s*:\s*(.+)$/i;

/**
 * A card's prose as moment fields, cut the way the page cuts it. The source
 * is the [WHY] body, or the lede for a card with none. Null when the cut
 * gives neither an idea nor what happens.
 */
export function turnMomentProse(
  data: Pick<InsightData, "why" | "headline">
): MomentProse | null {
  const source = data.why && data.why.trim() ? data.why : data.headline;
  const cut = splitInsightWhy(source);
  const leadLines = cut.lead
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const ideaParts: string[] = [];
  const happensParts: string[] = [];
  let labelled = false;
  for (const line of leadLines) {
    const m = LEAD_LABEL_RE.exec(line);
    if (!m) continue;
    labelled = true;
    if (m[1].toLowerCase() === "idea") ideaParts.push(m[2].trim());
    else happensParts.push(m[2].trim());
  }

  let idea: string | null;
  let happens: string | null;
  if (labelled) {
    idea = ideaParts.join(" ").trim() || null;
    happens = happensParts.join(" ").trim() || null;
  } else {
    const sentences = splitProseSentences(cut.lead)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    idea = sentences[0] ?? null;
    happens = sentences.slice(1).join(" ").trim() || null;
  }
  if (!idea && !happens) return null;

  return {
    idea,
    happens,
    proof: null,
    // The verbalizer is not asked for a pattern's name, so none is guessed.
    lesson: cut.lesson ? { pattern: "", check: cut.lesson } : null,
    question: null,
    more: cut.rest.trim() || null,
    omitted: [],
  };
}

export interface LiftTurnMomentArgs {
  insight: InsightContract;
  stage: LadderStage;
  /** The card exactly as the stream emits it, header through close token. */
  finalText: string;
}

/** An eval as the header shows it, or null when there is no number to show. */
function shown(e: EvalFact): string | null {
  return e.sentinel || e.display === "" ? null : e.display;
}

/**
 * The moment for one card the ladder shipped, or null: a stage the lift
 * does not take (a template, a footnoted card), a card the page would not
 * draw as this one card, or prose with neither line.
 */
export function liftTurnMoment(args: LiftTurnMomentArgs): TurnMoment | null {
  const { insight, stage, finalText } = args;
  if (!LIFTED_STAGES.has(stage)) return null;
  // The page strips practice tags before it parses, so the text it keys
  // would not be this one.
  if (finalText.includes("[PRACTICE:")) return null;
  const parsed = parseInsights(finalText).insights;
  if (parsed.length !== 1) return null;
  const card = parsed[0];
  if (
    card.moveNumber !== insight.moveNumber ||
    card.color !== insight.color ||
    card.playedMove !== insight.playedSan
  ) {
    return null;
  }
  const prose = turnMomentProse(card);
  if (!prose) return null;

  const top = insight.lines[0];
  const usable =
    !!top && top.san.length > 0 && !top.eval.sentinel && top.eval.depth > 0;
  const proof: ProofRef | null = usable
    ? { kind: "engine", moveNumber: insight.moveNumber, color: insight.color }
    : null;
  const proofLine: MomentProof | null =
    usable && proof
      ? {
          ...proof,
          startFen: insight.fenBefore,
          startPly: insight.ply,
          sans: top.san.slice(0, TURN_MOMENT_PROOF_PLIES),
          evalDisplay: shown(top.eval),
        }
      : null;

  return {
    ...prose,
    proof,
    ply: insight.ply,
    fen: insight.fenBefore,
    move: {
      san: insight.playedSan,
      moveNumber: insight.moveNumber,
      color: insight.color,
      verdict: insight.classification,
      evalBefore: shown(insight.evalBefore),
      evalAfter: shown(insight.evalAfter),
    },
    annotations: [],
    proofLine,
    actions: proofLine ? [{ kind: "play_proof" }] : [],
    card: {
      factIdPrefix: insight.factIdPrefix,
      moveNumber: insight.moveNumber,
      color: insight.color,
      playedSan: insight.playedSan,
      key: cardKey(finalText),
    },
  };
}

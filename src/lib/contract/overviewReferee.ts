/**
 * The ZERO-CARD review — the one game_review shape that shipped RAW.
 *
 * ── The hole ───────────────────────────────────────────────────────────────
 * `createEnforcedContractStream` refereeing is per-CARD: text is intercepted
 * only inside `[INSIGHT] … [/INSIGHT]` blocks, where it is anchored to an
 * insight and put through the ladder. Text OUTSIDE a block is forwarded
 * through the citation stripper and nothing else. That is correct while every
 * review has cards — the out-of-block text is a sentence or two of connective
 * tissue — but a review with NO cards is ENTIRELY out-of-block, so the whole
 * answer bypassed the referee. The verbalizer prompt even instructs the model
 * to free-write there ("There are no cards for this game. Write a short, warm
 * overview instead…"), which is exactly the prose least anchored to anything.
 *
 * The card-worthiness floor does not make this shape more common: it restores
 * the single best moment when nothing clears the floor, so a zero-card review
 * still means precisely what it always meant — `selectInsights` found no
 * mistake over 50cp in the whole game (a very short or a genuinely clean one).
 * But the floor DOES make the shape reachable more often in principle, and it
 * was already flagged, so it gets closed here.
 *
 * ── What can be checked without an insight ─────────────────────────────────
 * The insight-local checks (PV windows, per-position attack maps, motif
 * licensing, mobility arithmetic) all need a board to anchor to, and a
 * whole-game overview has none. What survives the loss of that anchor is
 * exactly the CONTRACT-GLOBAL grammar the referee already exports:
 *
 *   · eval figures     → collectContractEvalPools (pure numeric comparison;
 *                        the one check armed at error with 0 fires and 0
 *                        false positives across v1-v3);
 *   · SAN tokens       → collectContractWhitelist.san;
 *   · bare squares     → collectContractWhitelist.squares, claim sentences
 *                        only;
 *   · tactical claims  → the union of every insight's allowedTacticalKeywords.
 *                        On a zero-card game that union is usually EMPTY, and
 *                        that is the right answer: a game with no carded
 *                        mistake has no confirmed motif to talk about, so any
 *                        tactical claim in the overview is ungrounded.
 *
 * No LLM is involved (founder rule: chess.js + engine numbers only), and
 * nothing here can invent text — the only actions are DROP the offending
 * sentence (the ladder's own stage-(a) mechanic) or, if that leaves nothing,
 * fall back to a deterministic overview built from contract fields.
 */
import { splitProseSentences } from "./sentences";
import { dropViolatingSentences } from "./ladder";
import {
  checkEvalDisplays,
  collectContractWhitelist,
  isClaimSentence,
  isDefinitionalSentence,
  stripSanDecorations,
  tokenizeProse,
} from "./refereeChecks";
import type { RefereeViolation } from "./refereeChecks";
import { TACTICAL_CLAIM_KEYWORDS } from "@/lib/tactics";
import type { CoachContract } from "./types";

export interface OverviewRefereeResult {
  /** The prose to ship. Never longer than the input; never invented. */
  text: string;
  /** Everything the contract-global checks refuted. */
  violations: RefereeViolation[];
  /** How the result was reached. */
  outcome: "pass" | "sentence_drop" | "templated";
}

/** Contract-global SAN / square / tactical-keyword violations in overview prose. */
export function checkOverviewGrammar(
  prose: string,
  contract: CoachContract,
): RefereeViolation[] {
  const violations: RefereeViolation[] = [];
  const wl = collectContractWhitelist(contract);
  const allowed = new Set<string>();
  for (const ins of contract.insights) {
    for (const k of ins.allowedTacticalKeywords) allowed.add(k.toLowerCase());
  }

  // SAN tokens and bare squares. Single tokens only: multi-move sequence
  // judgement is a PV-window question, and an overview quotes no PV.
  for (const t of tokenizeProse(prose)) {
    if (t.kind === "piece_san") {
      if (wl.san.has(t.norm) || wl.san.has(stripSanDecorations(t.raw))) continue;
      violations.push({
        check: "san_whitelist",
        category: "san_unknown",
        span: t.raw,
        index: t.index,
        detail: `SAN token "${t.raw}" does not occur anywhere in the contract (game moves, lines, threats, motifs)`,
      });
    } else if (t.kind === "pawn_or_square") {
      if (wl.squares.has(t.raw)) continue;
      const sentence = sentenceAround(prose, t.index);
      if (!isClaimSentence(sentence)) continue;
      violations.push({
        check: "san_whitelist",
        category: "square_unknown",
        span: t.raw,
        index: t.index,
        detail: `square "${t.raw}" appears in a claim sentence but is in no contract position`,
      });
    }
  }

  // Tactical vocabulary. Definitional sentences (no square, no SAN, no
  // piece-on-square) teach a concept and are exempt, exactly as in
  // checkTacticalKeywords.
  const seen = new Set<string>();
  for (const keyword of TACTICAL_CLAIM_KEYWORDS) {
    const key = keyword.toLowerCase();
    if (allowed.has(key) || seen.has(key)) continue;
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}`, "gi");
    for (const m of Array.from(prose.matchAll(re))) {
      const idx = m.index ?? 0;
      if (isDefinitionalSentence(sentenceAround(prose, idx))) continue;
      seen.add(key);
      violations.push({
        check: "tactical_keyword",
        category: "tactical_keyword_unbacked",
        span: keyword,
        index: idx,
        detail: `tactical keyword "${keyword}" in a zero-card overview — the contract confirmed no motif of that type anywhere in the game`,
      });
      break;
    }
  }

  return violations;
}

function sentenceAround(prose: string, index: number): string {
  let offset = 0;
  for (const s of splitProseSentences(prose)) {
    const start = prose.indexOf(s, offset);
    if (start < 0) continue;
    offset = start + s.length;
    if (index >= start && index < offset) return s;
  }
  return prose;
}

/**
 * Referee a zero-card overview against the contract-global facts.
 *
 * Monotone by construction: pass through, drop offending sentences, or fall
 * back to `renderOverviewTemplate`. Nothing is ever added or rewritten.
 */
export function refereeOverview(
  prose: string,
  contract: CoachContract,
): OverviewRefereeResult {
  const violations = [
    ...checkEvalDisplays(prose, null, contract),
    ...checkOverviewGrammar(prose, contract),
  ];
  if (violations.length === 0) return { text: prose, violations, outcome: "pass" };

  const dropped = dropViolatingSentences(
    prose,
    violations.map((v) => v.span),
  );
  if (dropped !== null && dropped.trim().length > 0) {
    return { text: dropped, violations, outcome: "sentence_drop" };
  }
  return { text: renderOverviewTemplate(contract), violations, outcome: "templated" };
}

/**
 * The deterministic floor for a zero-card review: every clause is a contract
 * field, in the coach's register. Reached only when the model's overview was
 * refuted end to end — the founder's standing policy is that a bare true
 * answer beats a warm false one.
 */
export function renderOverviewTemplate(contract: CoachContract): string {
  const g = contract.game;
  const you = g.playerColor === "w" ? "White" : "Black";
  const opening = g.pgnHeaders.opening;
  const bits: string[] = [];

  bits.push(
    `Good news first: across all ${g.moveCount} move${g.moveCount === 1 ? "" : "s"} of this game as ${you}, the engine flagged nothing big enough to build a lesson card around.`,
  );
  if (opening) bits.push(`You were in the ${opening}.`);
  bits.push(
    g.resultText === "In progress"
      ? "The game is still running, so there is no result to read yet."
      : `The game finished: ${g.resultText.toLowerCase()}.`,
  );
  if (!g.hasGameEval) {
    bits.push(
      "Heads up — no engine evaluation came through for this game, so treat that as an absence of data rather than a clean bill of health.",
    );
  }
  bits.push(
    "Play a longer or sharper game and send it over — the review gets a lot more interesting when there is something to dig into.",
  );
  return bits.join(" ");
}

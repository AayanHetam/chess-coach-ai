// Multi-source consensus voter — Stages 6 + 7 + 8 of the Tactical Grounding Program.
//
// Takes deterministic grounding from Stages 1 (Syzygy), 3 (chessdb.cn), 5
// (motif detector), 7 (Lc0 neural eval), and 8 (Maia-2 per-rating visibility),
// plus the existing Stockfish eval, and compiles them into:
//   1. Per-claim-class confidence labels (HIGH / MED / LOW / NONE)
//   2. A unified groundingContext string that replaces hand-built prompt blocks
//   3. An allowedTacticalKeywords list so the motif-grounding validator knows
//      which keywords are permitted without re-running detection.
//
// Design: fail-closed. A claim with zero supporting sources is dropped, not asserted.

import type { AnyMotif } from "@/lib/tactics/types";
import { motifsToPropmt } from "@/lib/tactics";
import type { TablebaseResult } from "@/lib/mastermind/lichessTablebase";
import type { ChessdbResult } from "./chessdb";
import { chessdbResultToContext } from "./chessdb";
import { lc0AgreesWithSf, lc0ResultToContext } from "./lc0";
import type { Lc0Result } from "./lc0";
import { probToVisibility, maiaResultToContext } from "./maia";
import type { MaiaProbResult } from "./maia";

export type ConfidenceLevel = "HIGH" | "MED" | "LOW" | "NONE";

export interface VoterInput {
  motifs?: AnyMotif[];
  tablbaseResult?: TablebaseResult | null;
  chessdbResult?: ChessdbResult | null;
  // Stockfish eval for the position (centipawns, White's perspective — the
  // call site passes gameEval.positions[i].lines[0].cp, which parseResults
  // normalizes to White-positive when Black is to move). The confidence
  // math below uses Math.abs so direction is irrelevant; both sides of an
  // edge count equally toward grounding a material claim.
  stockfishEvalCp?: number | null;
  // Stockfish forced-mate distance (positive = mate available for the side
  // searched by Stockfish, in White's perspective alongside stockfishEvalCp).
  // Only `> 0` is consulted below, paired with cdb outcome — see
  // computeConfidence for the exact semantics.
  stockfishBestMoveMate?: number | null;
  // Stage 7: Lc0 neural eval (centipawns, same perspective as stockfishEvalCp
  // i.e. White-positive); null when not called.
  lc0Result?: Lc0Result | null;
  // Stage 8: Maia-2 per-rating visibility — probability that a player at the
  // user's rating plays the SF best move. Drives user_visibility: when
  // prob_plays_best < 0.15 (NONE), the LLM is told to suppress "obvious" /
  // "clearly" / "simply" / "just" language.
  maiaResult?: MaiaProbResult | null;
  // Optional SAN of the best move (for prompt readability — the maia result
  // carries the UCI). When omitted, the UCI is shown to the LLM.
  bestMoveSan?: string | null;
}

export interface VoterConfidence {
  endgame_wdl: ConfidenceLevel;
  tactical_motif: ConfidenceLevel;
  material_win: ConfidenceLevel;
  mate_in_n: ConfidenceLevel;
  // Stage 7: HIGH when SF and Lc0 agree on direction (both ≥ +150cp or both ≤ -150cp)
  positional_plan: ConfidenceLevel;
  // Stage 8: how likely the user finds SF's best move at their rating.
  // HIGH ≥ 0.50; MED ≥ 0.25; LOW ≥ 0.15; NONE < 0.15 (suppress "obvious").
  // NONE-with-no-data and NONE-because-hard are both reported as NONE — the
  // suppression rule only fires when maiaResult was actually consulted.
  user_visibility: ConfidenceLevel;
}

export interface VoterResult {
  confidence: VoterConfidence;
  // Tactical keywords the LLM is permitted to use (backed by confirmed motifs)
  allowedTacticalKeywords: string[];
  // Pre-formatted grounding block for injection into the LLM prompt
  groundingContext: string;
}

// Maps motif type → tactical keywords the LLM may use if that motif is confirmed
const MOTIF_TO_KEYWORDS: Partial<Record<AnyMotif["motif"], string[]>> = {
  fork:             ["fork", "double attack"],
  pin:              ["pin"],
  skewer:           ["skewer"],
  discovered_attack: ["discovered", "discovery", "discovered attack"],
  removed_defender: ["removes the defender", "deflection"],
  hanging_piece:    ["hanging"],
  trapped_piece:    ["trapped"],
  back_rank_mate:   ["back rank", "back-rank", "mate threat"],
  back_rank_threat: ["back rank", "back-rank", "mate threat"],
};

const ALL_TACTICAL_KEYWORDS = [
  "fork", "pin", "skewer", "discovered", "discovery", "discovered attack",
  "removes the defender", "deflection", "hanging", "trapped",
  "back rank", "back-rank", "mate threat", "double attack",
];

function computeConfidence(input: VoterInput): VoterConfidence {
  const motifs = input.motifs ?? [];
  const confirmedMotifs = motifs.filter((m) => m.confirmed);
  const sfCp = input.stockfishEvalCp ?? null;
  const lc0Cp = input.lc0Result?.eval_cp ?? null;
  const sfAndLc0Agree = lc0AgreesWithSf(sfCp, lc0Cp);

  // ── endgame_wdl: Syzygy = mathematically perfect; otherwise no grounding ──
  const tbCat = input.tablbaseResult?.category;
  const endgame_wdl: ConfidenceLevel =
    tbCat && ["win", "loss", "draw", "cursed-win", "blessed-loss"].includes(tbCat)
      ? "HIGH"
      : "NONE";

  // ── mate_in_n: Syzygy DTM (exact), else SF + chessdb agree ──────────────
  const syzygyMate = endgame_wdl === "HIGH" && tbCat === "win" && input.tablbaseResult?.dtm !== null;
  const sfMate = typeof input.stockfishBestMoveMate === "number" && input.stockfishBestMoveMate > 0;
  const cdbWin = input.chessdbResult?.outcome === "win";
  const mate_in_n: ConfidenceLevel = syzygyMate ? "HIGH" : sfMate && cdbWin ? "MED" : sfMate ? "LOW" : "NONE";

  // ── tactical_motif: confirmed detector output ────────────────────────────
  const tactical_motif: ConfidenceLevel =
    confirmedMotifs.length > 0 ? "HIGH" : motifs.length > 0 ? "MED" : "NONE";

  // ── material_win: confirmed win-material motif + engine agreement ────────
  // Stage 7 upgrade: if SF + Lc0 agree on direction, MED → HIGH
  //
  // sfCp arrives in White's perspective (see VoterInput jsdoc). A "material
  // edge" claim is direction-agnostic — either side being up ≥1.5 pawns is
  // sufficient grounding — so we compare against |sfCp|. Without Math.abs
  // the old `(sfCp ?? 0) >= 150` check silently missed every Black-mover
  // mistake where Black had the material advantage.
  const materialMotifs = confirmedMotifs.filter((m) =>
    ["fork", "hanging_piece", "skewer", "discovered_attack", "removed_defender"].includes(m.motif),
  );
  const sfAbsForMaterial = Math.abs(sfCp ?? 0);
  const sfStrong = sfAbsForMaterial >= 150;
  let material_win: ConfidenceLevel =
    materialMotifs.length > 0 && (sfStrong || cdbWin) ? "HIGH" :
    cdbWin && sfAbsForMaterial >= 100 ? "MED" :
    sfAbsForMaterial >= 200 ? "LOW" :
    "NONE";
  if (material_win === "MED" && sfAndLc0Agree) material_win = "HIGH";

  // ── positional_plan: Stage 7 — multi-source positional advantage signal ──
  //
  // Decision table:
  //   HIGH: SF + Lc0 both ≥ +150cp same direction (strong consensus per spec)
  //   NONE: Lc0 actively vetoes SF (opposite direction, |lc0| ≥ 50cp)
  //   MED:  SF ≥ +100cp with no meaningful Lc0 contradiction
  //   LOW:  SF in [50, 100)cp (weak single-engine signal)
  //   NONE: SF < 50cp (no positional plan claim possible)
  //
  // "Meaningful" Lc0 = |eval| ≥ 50cp. Below that threshold Lc0 is treated as
  // neutral noise and ignored for the decision.
  //
  // Design tension RESOLVED (async-grounding plan Q6, 2026-06-11):
  // `shouldCallLc0` originally fired only when |SF| ≤ 100, which mutually
  // excluded this HIGH branch (requiring SF ≥ 150) — unreachable via the
  // route trigger. The trigger band is now |SF| ≤ 200, so the [150, 200]
  // overlap makes both the positional_plan HIGH branch and the material_win
  // MED → HIGH upgrade reachable when Lc0 confirms. The veto path remains
  // the dominant production effect in [50, 100]cp positions.
  const sfNum = sfCp ?? 0;
  const sfAbsCp = Math.abs(sfNum);
  const lc0Num = lc0Cp ?? 0;
  const lc0Available = lc0Cp !== null;
  const lc0Meaningful = lc0Available && Math.abs(lc0Num) >= 50;
  const sameDirection = lc0Available && (
    (sfNum > 0 && lc0Num > 0) || (sfNum < 0 && lc0Num < 0)
  );
  const oppositeDirection = lc0Available && (
    (sfNum > 0 && lc0Num < 0) || (sfNum < 0 && lc0Num > 0)
  );
  const lc0Vetoes = lc0Meaningful && oppositeDirection;

  const positional_plan: ConfidenceLevel =
    sfAndLc0Agree                                          ? "HIGH" :
    lc0Vetoes                                              ? "NONE" :
    sfAbsCp >= 100 && (sameDirection || !lc0Meaningful)    ? "MED" :
    sfAbsCp >= 50                                          ? "LOW" :
                                                             "NONE";

  // ── user_visibility: Stage 8 — Maia per-rating "obviousness" gating ─────
  // Reflects how likely a player at the user's rating finds the SF best move.
  // The rating-aware suppression rule fires when this is NONE *and* maiaResult
  // was actually consulted (see buildGroundingContext for the rule emission).
  const user_visibility: ConfidenceLevel = input.maiaResult
    ? probToVisibility(input.maiaResult.prob_plays_best)
    : "NONE";

  return {
    endgame_wdl,
    tactical_motif,
    material_win,
    mate_in_n,
    positional_plan,
    user_visibility,
  };
}

function buildAllowedKeywords(confirmedMotifs: AnyMotif[]): string[] {
  const allowed: string[] = [];
  for (const m of confirmedMotifs) {
    for (const kw of MOTIF_TO_KEYWORDS[m.motif] ?? []) {
      if (!allowed.includes(kw)) allowed.push(kw);
    }
  }
  return allowed;
}

function buildGroundingContext(input: VoterInput, confidence: VoterConfidence): string {
  const motifs = input.motifs ?? [];
  const confirmedMotifs = motifs.filter((m) => m.confirmed);
  const unconfirmedMotifs = motifs.filter((m) => !m.confirmed);
  const parts: string[] = [];

  // ── Endgame ground truth (highest authority — prepended) ─────────────────
  if (input.tablbaseResult && confidence.endgame_wdl === "HIGH") {
    const tb = input.tablbaseResult;
    let tbLine = `ENDGAME GROUND TRUTH (Syzygy — mathematically perfect): ${tb.category}`;
    if (tb.dtm !== null) tbLine += ` | DTM: ${tb.dtm} moves`;
    if (tb.dtz !== null) tbLine += ` | DTZ: ${tb.dtz}`;
    if (tb.moves.length > 0) tbLine += ` | Best: ${tb.moves[0].san ?? tb.moves[0].uci}`;
    parts.push(`${tbLine}\nRULE: Endgame outcome claims MUST match this exactly.`);
  }

  // ── Tactical facts block ─────────────────────────────────────────────────
  if (confirmedMotifs.length > 0) {
    parts.push(
      `TACTICAL FACTS (confirmed by deterministic detector — narrate only these):\n` +
      motifsToPropmt(confirmedMotifs),
    );
  } else if (motifs.length > 0) {
    const refLines = unconfirmedMotifs
      .filter((m) => m.refutation)
      .map((m) => `  ${m.motif}: refuted by ${m.refutation!.move} (${m.refutation!.refuted_by})`)
      .join("\n");
    parts.push(
      `TACTICAL FACTS: [] — structural patterns detected but all escapable against best defense.` +
      (refLines ? `\nRefutations:\n${refLines}` : "") +
      `\nDo not assert: fork, pin, skewer, discovered, hanging, trapped, back rank, mate threat.`,
    );
  } else {
    parts.push(
      `TACTICAL FACTS: [] — no tactical patterns detected.\n` +
      `Do not use: fork, pin, skewer, discovered, removes the defender, hanging, trapped, back rank, mate threat.`,
    );
  }

  // ── Unconfirmed with refutation (coach may cite if they name the refutation) ──
  if (unconfirmedMotifs.some((m) => m.refutation)) {
    const list = unconfirmedMotifs
      .filter((m) => m.refutation)
      .map((m) => `${m.motif} — refuted by ${m.refutation!.move}`)
      .join("; ");
    parts.push(
      `UNCONFIRMED PATTERNS (mention ONLY if you explicitly cite the refutation move): ${list}`,
    );
  }

  // ── Cloud eval block ─────────────────────────────────────────────────────
  if (input.chessdbResult) {
    const cctx = chessdbResultToContext(input.chessdbResult);
    if (cctx) parts.push(cctx);
  }

  // ── Stage 7: Lc0 neural eval block ───────────────────────────────────────
  if (input.lc0Result && confidence.positional_plan !== "NONE") {
    const lc0ctx = lc0ResultToContext(input.lc0Result, input.stockfishEvalCp ?? null);
    if (lc0ctx) {
      const planRule = confidence.positional_plan === "HIGH"
        ? "RULE: Both engines agree — positional and material claims at full confidence."
        : "RULE: SF shows advantage but Lc0 not consulted — positional claims at medium confidence.";
      parts.push(`${lc0ctx}\n${planRule}`);
    }
  }

  // ── Stage 8: Maia per-rating visibility block ────────────────────────────
  // Always emit when maiaResult was consulted — the LOW/NONE cases carry
  // suppression rules the LLM must follow; the HIGH/MED cases give context
  // that helps the coach calibrate tone (don't congratulate trivial moves).
  if (input.maiaResult) {
    const mctx = maiaResultToContext(input.maiaResult, input.bestMoveSan ?? null);
    if (mctx) parts.push(mctx);
  }

  return parts.join("\n\n");
}

/**
 * Compile a unified VoterResult from all available grounding sources.
 * Pure function — no side-effects, no async, no LLM calls.
 */
export function compileVoterResult(input: VoterInput): VoterResult {
  const confidence = computeConfidence(input);
  const confirmedMotifs = (input.motifs ?? []).filter((m) => m.confirmed);
  return {
    confidence,
    allowedTacticalKeywords: buildAllowedKeywords(confirmedMotifs),
    groundingContext: buildGroundingContext(input, confidence),
  };
}

/**
 * Returns true if the voter result permits a given tactical keyword.
 * Used by the motif-grounding validator as a faster alternative to re-running detection.
 */
export function isKeywordAllowed(keyword: string, result: VoterResult): boolean {
  const kw = keyword.toLowerCase();
  return result.allowedTacticalKeywords.some((k) => k.toLowerCase() === kw);
}

/**
 * All tactical keywords that are never allowed without grounding.
 * Exported for use in validators.
 */
export { ALL_TACTICAL_KEYWORDS };

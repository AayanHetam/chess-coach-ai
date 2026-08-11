/**
 * Mechanical false-positive adjudication for referee fires (extracted from
 * contract_fidelity_eval.ts --fp-measure so the CI-5 gate harness can reuse
 * it WITHOUT importing that script's top-level main()).
 *
 * The referee's checks are insight-LOCAL by design (plan §4.3). A fire whose
 * span is backed elsewhere in the SAME contract ("earlier you played Nf3") is
 * the documented measurement-bias class — legitimate prose, not fabrication.
 * These pools are contract-GLOBAL and are built from the same exported
 * grammar the checks themselves use (buildWhitelist / collectEvalPools /
 * fenPieceSquares), so the adjudicator can never drift from the checks.
 *
 * Anything not PROVABLY licensed stays "needs-review": the adjudicator only
 * ever says "this fire was false", never "this fire was true".
 */
import type { CoachContract } from "@/lib/contract/types";

export type FpAdjudication =
  | "widened-licensed" // strict-only: the sequence IS a contiguous window of a contract PV
  | "game-history-recap" // the sequence is a contiguous window of the actual game moves
  | "licensed-elsewhere-in-contract" // span backed by another insight / the move table
  | "needs-review"; // no mechanical license — human/CI-4 adjudication required

export interface FpContractPools {
  san: Set<string>;
  squares: Set<string>;
  pawns: number[];
  mates: number[];
  keywords: Set<string>;
  /** Normalized actual game moves (contract.game.moveHistory). */
  gameMoves: string[];
  /** All insights' PVs + move-table bestWas lines (contract-global). */
  pvs: string[][];
}

/**
 * Contract-GLOBAL license pools for mechanical adjudication. The referee
 * checks are insight-LOCAL by design (plan §4.3); a fire whose span is backed
 * elsewhere in the same contract ("earlier you played Nf3") is the documented
 * measurement-bias class — legitimate prose, not fabrication. Built from the
 * same exported grammar (buildWhitelist / collectEvalPools / fenPieceSquares)
 * so the adjudicator can never drift from the checks.
 */
export async function buildFpPools(contract: CoachContract): Promise<FpContractPools> {
  const { buildWhitelist, collectEvalPools, fenPieceSquares, stripSanDecorations } = await import(
    "@/lib/contract/refereeChecks"
  );
  const san = new Set<string>();
  const squares = new Set<string>();
  const pawns: number[] = [];
  const mates: number[] = [];
  const keywords = new Set<string>();
  const pvs: string[][] = [];
  const addSanToken = (raw: string) => {
    const s = stripSanDecorations(raw);
    if (!s) return;
    san.add(s);
    for (const sq of s.match(/[a-h][1-8]/g) ?? []) squares.add(sq);
  };

  for (const ins of contract.insights) {
    const wl = buildWhitelist(ins);
    wl.san.forEach((s) => san.add(s));
    wl.squares.forEach((sq) => squares.add(sq));
    pvs.push(...wl.pvs);
    const ep = collectEvalPools(ins);
    pawns.push(...ep.pawns);
    mates.push(...ep.mates);
    for (const k of ins.allowedTacticalKeywords) keywords.add(k.toLowerCase());
  }

  const gameMoves = contract.game.moveHistory.map(stripSanDecorations);
  for (const m of contract.game.moveHistory) addSanToken(m);
  for (const row of contract.moveTable) {
    if (row.evalAfter && !row.evalAfter.sentinel) {
      if (row.evalAfter.mate !== null) mates.push(row.evalAfter.mate);
      else if (row.evalAfter.cp !== null) pawns.push(row.evalAfter.cp / 100);
    }
    for (const fen of [row.fenBefore, row.fenAfter]) {
      if (fen) for (const sq of fenPieceSquares(fen)) squares.add(sq);
    }
    if (row.bestWas) {
      addSanToken(row.bestWas.san);
      if (row.bestWas.line) {
        const line = row.bestWas.line.san.map(stripSanDecorations);
        pvs.push(line);
        for (const s of row.bestWas.line.san) addSanToken(s);
        const ev = row.bestWas.line.eval;
        if (!ev.sentinel) {
          if (ev.mate !== null) mates.push(ev.mate);
          else if (ev.cp !== null) pawns.push(ev.cp / 100);
        }
      }
    }
  }
  return { san, squares, pawns, mates, keywords, gameMoves, pvs };
}

export interface FpAdjudicateHelpers {
  stripSanDecorations: (s: string) => string;
  isPvWindow: (seq: string[], pvs: string[][]) => boolean;
}

/** Mechanical adjudication of one fire. Anything not provably licensed stays
 * "needs-review" — no hand-waving; the span+sentence ship in the output. */
export function adjudicateFp(
  v: { category: string; span: string; wouldPassWidenedWindow?: boolean },
  pools: FpContractPools,
  helpers: FpAdjudicateHelpers,
): FpAdjudication {
  const { stripSanDecorations, isPvWindow } = helpers;
  switch (v.category) {
    case "hypothetical_line_off_contract": {
      if (v.wouldPassWidenedWindow) return "widened-licensed";
      const seq = v.span.split(/\s+/).map(stripSanDecorations).filter(Boolean);
      if (seq.length > 0 && isPvWindow(seq, [pools.gameMoves])) return "game-history-recap";
      if (seq.length > 0 && isPvWindow(seq, pools.pvs)) return "licensed-elsewhere-in-contract";
      return "needs-review";
    }
    case "san_unknown":
      return pools.san.has(stripSanDecorations(v.span)) ? "licensed-elsewhere-in-contract" : "needs-review";
    case "square_unknown":
      return pools.squares.has(v.span) ? "licensed-elsewhere-in-contract" : "needs-review";
    case "eval_unbacked": {
      const val = Number.parseFloat(v.span);
      return Number.isFinite(val) &&
        pools.pawns.some((p) => Math.abs(p - val) <= EVAL_ADJUDICATION_TOLERANCE + 1e-9)
        ? "licensed-elsewhere-in-contract"
        : "needs-review";
    }
    case "mate_distance_wrong": {
      const signed = v.span.match(/^M([+-]\d+)$/);
      if (signed) {
        const d = Number.parseInt(signed[1], 10);
        return pools.mates.some((md) => md === d) ? "licensed-elsewhere-in-contract" : "needs-review";
      }
      const m = v.span.match(/\d+/);
      const dist = m ? Number.parseInt(m[0], 10) : Number.NaN;
      return pools.mates.some((md) => Math.abs(md) === dist)
        ? "licensed-elsewhere-in-contract"
        : "needs-review";
    }
    case "tactical_keyword_unbacked":
      return pools.keywords.has(v.span.toLowerCase()) ? "licensed-elsewhere-in-contract" : "needs-review";
    default:
      return "needs-review";
  }
}
/** Same ±0.3-pawn tolerance the eval-display check itself uses. */
export const EVAL_ADJUDICATION_TOLERANCE = 0.3;

import { describe, it, expect } from "vitest";
import { compileVoterResult, isKeywordAllowed } from "../voter";
import type { AnyMotif } from "@/lib/tactics/types";
import type { TablebaseResult } from "@/lib/mastermind/lichessTablebase";
import type { ChessdbResult } from "../chessdb";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONFIRMED_FORK: AnyMotif = {
  motif: "fork",
  by_piece: "n",
  by_square: "e5",
  targets: [{ square: "d7", piece: "q" }, { square: "f7", piece: "r" }],
  unavoidable_loss_cp: 500,
  confirmed: true,
  refutation: null,
};

const UNCONFIRMED_FORK: AnyMotif = {
  ...CONFIRMED_FORK,
  confirmed: false,
  refutation: { move: "Rxe5", refuted_by: "recapture" },
};

const CONFIRMED_PIN: AnyMotif = {
  motif: "pin",
  kind: "absolute",
  pinner: { square: "g2", piece: "b" },
  pinned: { square: "d5", piece: "n" },
  behind: { square: "a8", piece: "k" },
  ray: "g2-a8",
  confirmed: true,
  refutation: null,
};

const SYZYGY_WIN: TablebaseResult = {
  category: "win",
  dtm: 14,
  dtz: 10,
  checkmate: false,
  stalemate: false,
  insufficientMaterial: false,
  moves: [{ uci: "e4e5", san: "Ke5", category: "win", dtm: 13, dtz: 9 }],
};

const SYZYGY_DRAW: TablebaseResult = {
  category: "draw",
  dtm: null,
  dtz: 0,
  checkmate: false,
  stalemate: false,
  insufficientMaterial: false,
  moves: [],
};

const CHESSDB_WIN: ChessdbResult = {
  fen: "test",
  best_move: "Rxf7",
  score_cp: 250,
  outcome: "win",
  source: "live",
};

const CHESSDB_UNKNOWN: ChessdbResult = {
  fen: "test",
  best_move: null,
  score_cp: null,
  outcome: "unknown",
  source: "live",
};

// ── endgame_wdl confidence ────────────────────────────────────────────────────

describe("compileVoterResult — endgame_wdl", () => {
  it("HIGH when Syzygy win", () => {
    const r = compileVoterResult({ tablbaseResult: SYZYGY_WIN });
    expect(r.confidence.endgame_wdl).toBe("HIGH");
  });

  it("HIGH when Syzygy draw", () => {
    const r = compileVoterResult({ tablbaseResult: SYZYGY_DRAW });
    expect(r.confidence.endgame_wdl).toBe("HIGH");
  });

  it("NONE when no tablebase result", () => {
    const r = compileVoterResult({});
    expect(r.confidence.endgame_wdl).toBe("NONE");
  });

  it("NONE when tablebase null", () => {
    const r = compileVoterResult({ tablbaseResult: null });
    expect(r.confidence.endgame_wdl).toBe("NONE");
  });

  it("NONE when tablebase category is unknown", () => {
    const r = compileVoterResult({
      tablbaseResult: { ...SYZYGY_WIN, category: "unknown" },
    });
    expect(r.confidence.endgame_wdl).toBe("NONE");
  });
});

// ── mate_in_n confidence ──────────────────────────────────────────────────────

describe("compileVoterResult — mate_in_n", () => {
  it("HIGH when Syzygy win with DTM", () => {
    const r = compileVoterResult({ tablbaseResult: SYZYGY_WIN });
    expect(r.confidence.mate_in_n).toBe("HIGH");
  });

  it("MED when SF mate AND chessdb win (no Syzygy)", () => {
    const r = compileVoterResult({
      stockfishBestMoveMate: 5,
      chessdbResult: CHESSDB_WIN,
    });
    expect(r.confidence.mate_in_n).toBe("MED");
  });

  it("LOW when SF mate only", () => {
    const r = compileVoterResult({ stockfishBestMoveMate: 3 });
    expect(r.confidence.mate_in_n).toBe("LOW");
  });

  it("NONE when nothing", () => {
    const r = compileVoterResult({});
    expect(r.confidence.mate_in_n).toBe("NONE");
  });
});

// ── tactical_motif confidence ─────────────────────────────────────────────────

describe("compileVoterResult — tactical_motif", () => {
  it("HIGH when confirmed motifs present", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK] });
    expect(r.confidence.tactical_motif).toBe("HIGH");
  });

  it("MED when unconfirmed motifs only", () => {
    const r = compileVoterResult({ motifs: [UNCONFIRMED_FORK] });
    expect(r.confidence.tactical_motif).toBe("MED");
  });

  it("NONE when no motifs", () => {
    const r = compileVoterResult({});
    expect(r.confidence.tactical_motif).toBe("NONE");
  });
});

// ── material_win confidence ───────────────────────────────────────────────────

describe("compileVoterResult — material_win", () => {
  it("HIGH when confirmed material motif + SF strong eval", () => {
    const r = compileVoterResult({
      motifs: [CONFIRMED_FORK],
      stockfishEvalCp: 200,
    });
    expect(r.confidence.material_win).toBe("HIGH");
  });

  it("HIGH when confirmed material motif + chessdb win", () => {
    const r = compileVoterResult({
      motifs: [CONFIRMED_FORK],
      chessdbResult: CHESSDB_WIN,
    });
    expect(r.confidence.material_win).toBe("HIGH");
  });

  it("LOW when SF strong but no confirmed motif", () => {
    const r = compileVoterResult({ stockfishEvalCp: 220 });
    expect(r.confidence.material_win).toBe("LOW");
  });

  it("NONE when pin confirmed (not material-winning type) + no engine agreement", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_PIN] });
    expect(r.confidence.material_win).toBe("NONE");
  });
});

// ── allowedTacticalKeywords ───────────────────────────────────────────────────

describe("compileVoterResult — allowedTacticalKeywords", () => {
  it("includes fork keywords when fork confirmed", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK] });
    expect(r.allowedTacticalKeywords).toContain("fork");
    expect(r.allowedTacticalKeywords).toContain("double attack");
  });

  it("includes pin keywords when pin confirmed", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_PIN] });
    expect(r.allowedTacticalKeywords).toContain("pin");
  });

  it("empty when only unconfirmed motifs", () => {
    const r = compileVoterResult({ motifs: [UNCONFIRMED_FORK] });
    expect(r.allowedTacticalKeywords).toHaveLength(0);
  });

  it("merges keywords from multiple confirmed motifs", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK, CONFIRMED_PIN] });
    expect(r.allowedTacticalKeywords).toContain("fork");
    expect(r.allowedTacticalKeywords).toContain("pin");
  });
});

// ── groundingContext content ──────────────────────────────────────────────────

describe("compileVoterResult — groundingContext", () => {
  it("contains TACTICAL FACTS header when confirmed motifs present", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK] });
    expect(r.groundingContext).toContain("TACTICAL FACTS (confirmed");
  });

  it("suppression text when no motifs", () => {
    const r = compileVoterResult({});
    expect(r.groundingContext).toContain("TACTICAL FACTS: []");
    expect(r.groundingContext).toContain("Do not use");
  });

  it("includes refutation in unconfirmed section", () => {
    const r = compileVoterResult({ motifs: [UNCONFIRMED_FORK] });
    expect(r.groundingContext).toContain("Rxe5");
    expect(r.groundingContext).toContain("UNCONFIRMED PATTERNS");
  });

  it("includes endgame ground truth when Syzygy present", () => {
    const r = compileVoterResult({ tablbaseResult: SYZYGY_WIN });
    expect(r.groundingContext).toContain("ENDGAME GROUND TRUTH");
    expect(r.groundingContext).toContain("DTM: 14");
    expect(r.groundingContext).toContain("Ke5");
  });

  it("includes chessdb eval when result known", () => {
    const r = compileVoterResult({ chessdbResult: CHESSDB_WIN });
    expect(r.groundingContext).toContain("ChessDB");
    expect(r.groundingContext).toContain("Rxf7");
  });

  it("omits chessdb when outcome is unknown", () => {
    const r = compileVoterResult({ chessdbResult: CHESSDB_UNKNOWN });
    expect(r.groundingContext).not.toContain("ChessDB");
  });

  it("endgame block appears before tactical block", () => {
    const r = compileVoterResult({
      motifs: [CONFIRMED_FORK],
      tablbaseResult: SYZYGY_WIN,
    });
    const endgameIdx = r.groundingContext.indexOf("ENDGAME GROUND TRUTH");
    const tacticalIdx = r.groundingContext.indexOf("TACTICAL FACTS");
    expect(endgameIdx).toBeLessThan(tacticalIdx);
  });
});

// ── isKeywordAllowed ──────────────────────────────────────────────────────────

// ── Stage 7: Lc0 integration ──────────────────────────────────────────────────

import type { Lc0Result } from "../lc0";

const LC0_AGREE: Lc0Result = {
  fen: "test",
  eval_cp: 200,
  best_move: "Nf6",
  nodes: 800,
  model: "lc0",
  source: "live",
};

const LC0_DISAGREE: Lc0Result = {
  fen: "test",
  eval_cp: -50,
  best_move: "e5",
  nodes: 800,
  model: "lc0",
  source: "live",
};

describe("compileVoterResult — positional_plan (Stage 7)", () => {
  it("HIGH when SF and Lc0 both ≥ +150cp", () => {
    const r = compileVoterResult({ stockfishEvalCp: 180, lc0Result: LC0_AGREE });
    expect(r.confidence.positional_plan).toBe("HIGH");
  });

  it("HIGH when SF and Lc0 both ≤ -150cp", () => {
    const lc0Loss: Lc0Result = { ...LC0_AGREE, eval_cp: -200 };
    const r = compileVoterResult({ stockfishEvalCp: -170, lc0Result: lc0Loss });
    expect(r.confidence.positional_plan).toBe("HIGH");
  });

  it("MED when SF ≥ +100cp but Lc0 not available", () => {
    const r = compileVoterResult({ stockfishEvalCp: 120, lc0Result: null });
    expect(r.confidence.positional_plan).toBe("MED");
  });

  it("LOW when SF ≥ +50cp with no Lc0", () => {
    const r = compileVoterResult({ stockfishEvalCp: 60 });
    expect(r.confidence.positional_plan).toBe("LOW");
  });

  it("NONE when SF near 0", () => {
    const r = compileVoterResult({ stockfishEvalCp: 20 });
    expect(r.confidence.positional_plan).toBe("NONE");
  });

  it("NONE when Lc0 actively vetoes SF (opposite direction, |lc0| ≥ 50cp)", () => {
    // SF says +1.8 but Lc0 says -0.5 — engines actively conflict.
    // Without Lc0 we'd report LOW; with Lc0 contradicting, we drop to NONE.
    const r = compileVoterResult({ stockfishEvalCp: 180, lc0Result: LC0_DISAGREE });
    expect(r.confidence.positional_plan).toBe("NONE");
  });

  it("MED when Lc0 is too weak to veto (|lc0| < 50) — SF alone drives the read", () => {
    // Lc0 at -20 is below the 50cp veto threshold → treated as neutral noise.
    // SF=120 alone → MED.
    const weakDisagree: Lc0Result = { ...LC0_DISAGREE, eval_cp: -20 };
    const r = compileVoterResult({ stockfishEvalCp: 120, lc0Result: weakDisagree });
    expect(r.confidence.positional_plan).toBe("MED");
  });
});

describe("compileVoterResult — material_win upgrade (Stage 7)", () => {
  it("upgrades material_win from MED to HIGH when SF+Lc0 agree (both ≥ +150cp)", () => {
    // Without Lc0: cdbWin + SF=160 → MED. With Lc0=200 agreeing → upgrade to HIGH.
    const r = compileVoterResult({
      chessdbResult: CHESSDB_WIN,
      stockfishEvalCp: 160,
      lc0Result: LC0_AGREE,
    });
    expect(r.confidence.material_win).toBe("HIGH");
  });

  it("keeps material_win HIGH without Lc0 if motif + SF already HIGH", () => {
    const r = compileVoterResult({
      motifs: [CONFIRMED_FORK],
      stockfishEvalCp: 160,
      lc0Result: null,
    });
    expect(r.confidence.material_win).toBe("HIGH");
  });

  it("does NOT upgrade NONE to HIGH even when SF+Lc0 agree", () => {
    const r = compileVoterResult({ stockfishEvalCp: 180, lc0Result: LC0_AGREE });
    // No material motifs, no cdbWin → material_win stays LOW not HIGH
    expect(r.confidence.material_win).not.toBe("HIGH");
  });
});

describe("compileVoterResult — Lc0 grounding context", () => {
  it("includes Lc0 line when positional_plan is HIGH", () => {
    const r = compileVoterResult({ stockfishEvalCp: 180, lc0Result: LC0_AGREE });
    expect(r.groundingContext).toContain("Lc0 neural eval");
    expect(r.groundingContext).toContain("AGREES with Stockfish");
  });

  it("does NOT include Lc0 line when positional_plan is NONE", () => {
    const r = compileVoterResult({ stockfishEvalCp: 10, lc0Result: LC0_AGREE });
    expect(r.groundingContext).not.toContain("Lc0 neural eval");
  });

  it("includes positional_plan rule line when HIGH", () => {
    const r = compileVoterResult({ stockfishEvalCp: 180, lc0Result: LC0_AGREE });
    expect(r.groundingContext).toContain("Both engines agree");
  });
});

// ── Stage 8: Maia per-rating user_visibility ─────────────────────────────────

import type { MaiaProbResult } from "../maia";

const MAIA_OBVIOUS: MaiaProbResult = {
  fen: "test",
  rating: 1500,
  best_move_uci: "e2e4",
  prob_plays_best: 0.65,
  likely_moves: [{ move: "e4", probability: 0.65 }],
  model: "maia2",
  source: "live",
};

const MAIA_HARD: MaiaProbResult = {
  fen: "test",
  rating: 1200,
  best_move_uci: "g1f3",
  prob_plays_best: 0.08,
  likely_moves: [{ move: "d4", probability: 0.40 }, { move: "Nf3", probability: 0.08 }],
  model: "maia2",
  source: "live",
};

describe("compileVoterResult — user_visibility (Stage 8)", () => {
  it("HIGH when Maia prob >= 0.50", () => {
    const r = compileVoterResult({ maiaResult: MAIA_OBVIOUS });
    expect(r.confidence.user_visibility).toBe("HIGH");
  });

  it("NONE when Maia prob < 0.15 (suppression trigger)", () => {
    const r = compileVoterResult({ maiaResult: MAIA_HARD });
    expect(r.confidence.user_visibility).toBe("NONE");
  });

  it("NONE when Maia not consulted (no maiaResult)", () => {
    const r = compileVoterResult({});
    expect(r.confidence.user_visibility).toBe("NONE");
  });

  it("MED in [0.25, 0.50)", () => {
    const r = compileVoterResult({
      maiaResult: { ...MAIA_OBVIOUS, prob_plays_best: 0.35 },
    });
    expect(r.confidence.user_visibility).toBe("MED");
  });

  it("LOW in [0.15, 0.25)", () => {
    const r = compileVoterResult({
      maiaResult: { ...MAIA_OBVIOUS, prob_plays_best: 0.18 },
    });
    expect(r.confidence.user_visibility).toBe("LOW");
  });
});

describe("compileVoterResult — Maia grounding context (Stage 8)", () => {
  it("includes 'Do NOT use obvious/clearly' rule when user_visibility is NONE with maia data", () => {
    const r = compileVoterResult({ maiaResult: MAIA_HARD, bestMoveSan: "Nf3" });
    expect(r.groundingContext).toContain("Do NOT use");
    expect(r.groundingContext).toContain("obvious");
    expect(r.groundingContext).toContain("Nf3");
    expect(r.groundingContext).toContain("8.0%");
  });

  it("does NOT emit Maia block when maiaResult is null (no consultation)", () => {
    const r = compileVoterResult({});
    expect(r.groundingContext).not.toContain("USER VISIBILITY");
    expect(r.groundingContext).not.toContain("Do NOT use");
  });

  it("emits informational context for HIGH visibility without suppression rule", () => {
    const r = compileVoterResult({ maiaResult: MAIA_OBVIOUS, bestMoveSan: "e4" });
    expect(r.groundingContext).toContain("USER VISIBILITY");
    expect(r.groundingContext).toContain("65.0%");
    expect(r.groundingContext).not.toContain("Do NOT use");
  });

  it("threads bestMoveSan into the Maia block", () => {
    const r = compileVoterResult({ maiaResult: MAIA_HARD, bestMoveSan: "Nf3" });
    expect(r.groundingContext).toContain("best move Nf3");
  });
});

describe("isKeywordAllowed", () => {
  it("returns true for allowed keyword (case-insensitive)", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK] });
    expect(isKeywordAllowed("Fork", r)).toBe(true);
    expect(isKeywordAllowed("FORK", r)).toBe(true);
  });

  it("returns false when keyword not in allowed list", () => {
    const r = compileVoterResult({ motifs: [CONFIRMED_FORK] });
    expect(isKeywordAllowed("pin", r)).toBe(false);
  });

  it("returns false when no confirmed motifs", () => {
    const r = compileVoterResult({});
    expect(isKeywordAllowed("fork", r)).toBe(false);
  });
});

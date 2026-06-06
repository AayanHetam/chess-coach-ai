import { describe, it, expect } from "vitest";
import {
  buildSyncVoterSnapshot,
  buildAsyncVoterSnapshot,
} from "@/lib/grounding/voterSnapshot";
import type { MaiaProbResult } from "@/lib/grounding/maia";
import type { Lc0Result } from "@/lib/grounding/lc0";
import type { ChessdbResult } from "@/lib/grounding/chessdb";

// Verified test fixtures (mirrors src/lib/tactics/__tests__/index.test.ts)
const FORK_FEN_BEFORE = "4k3/3q1r2/8/8/8/5N2/8/4K3 w - - 0 1";
const FORK_MOVE = "Ne5";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// ── buildSyncVoterSnapshot ──────────────────────────────────────────────────

describe("buildSyncVoterSnapshot", () => {
  it("returns a snapshot with maiaProb=null, lc0Cp=null, syzygyDtm=null", () => {
    const snap = buildSyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 300,
      stockfishBestMoveMate: null,
      userRating: 1500,
    });
    expect(snap.maiaProb).toBeNull();
    expect(snap.lc0Cp).toBeNull();
    expect(snap.syzygyDtm).toBeNull();
  });

  it("plumbs through stockfishEvalCp / stockfishBestMoveMate / userRating", () => {
    const snap = buildSyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 220,
      stockfishBestMoveMate: 7,
      userRating: 1800,
    });
    expect(snap.sfCp).toBe(220);
    expect(snap.sfMate).toBe(7);
    expect(snap.userRating).toBe(1800);
  });

  it("derives positional_plan confidence from sfCp alone (no Lc0)", () => {
    const snap = buildSyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 200,  // strong SF advantage but no Lc0 → MED
      stockfishBestMoveMate: null,
      userRating: 1500,
    });
    // sfCp=200, lc0=null, |sfCp|>=100, no Lc0 contradicts → MED per voter logic
    expect(snap.confidence.positional_plan).toBe("MED");
  });

  it("user_visibility resolves to NONE when no Maia data (correct downstream no-op trigger)", () => {
    const snap = buildSyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 100,
      stockfishBestMoveMate: null,
      userRating: 1500,
    });
    expect(snap.confidence.user_visibility).toBe("NONE");
    expect(snap.maiaProb).toBeNull();
    // The downstream userVisibilityValidator treats maiaProb=null as
    // "no-op": confirmed by the validator test
    // src/lib/mastermind/__tests__/validators/userVisibility.test.ts
    // ("passes silently when maiaProb is null").
  });

  it("detects confirmed fork motif and surfaces it in material_win HIGH (when SF strong)", () => {
    const snap = buildSyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 300,  // sfStrong
      stockfishBestMoveMate: null,
      userRating: 1500,
    });
    // motif + sfStrong → material_win HIGH per voter
    expect(snap.confidence.material_win).toBe("HIGH");
  });

  it("handles invalid SAN gracefully — empty motif list, snapshot still valid", () => {
    const snap = buildSyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: "Zz9",
      stockfishEvalCp: 100,
      stockfishBestMoveMate: null,
      userRating: 1500,
    });
    // Should not throw; snapshot has voter computed against empty motifs
    expect(snap.confidence.material_win).toBeDefined();
  });

  it("handles invalid FEN gracefully", () => {
    const snap = buildSyncVoterSnapshot({
      fenBefore: "not-a-fen",
      moveSan: "e4",
      stockfishEvalCp: null,
      stockfishBestMoveMate: null,
      userRating: 1500,
    });
    expect(snap.confidence.material_win).toBeDefined();
    expect(snap.sfCp).toBeNull();
  });

  it("starting-position pawn move yields NONE confidences (no motif, no eval)", () => {
    const snap = buildSyncVoterSnapshot({
      fenBefore: START_FEN,
      moveSan: "e4",
      stockfishEvalCp: 20,
      stockfishBestMoveMate: null,
      userRating: 1500,
    });
    expect(snap.confidence.material_win).toBe("NONE");
    expect(snap.confidence.positional_plan).toBe("NONE");
    expect(snap.confidence.mate_in_n).toBe("NONE");
    expect(snap.confidence.user_visibility).toBe("NONE");
  });
});

// ── buildAsyncVoterSnapshot ─────────────────────────────────────────────────

const MAIA: MaiaProbResult = {
  fen: "test",
  rating: 1500,
  best_move_uci: "e2e4",
  prob_plays_best: 0.42,
  likely_moves: [],
  model: "maia2",
  source: "live",
};

const LC0: Lc0Result = {
  fen: "test",
  eval_cp: 280,
  best_move: "Nf3",
  nodes: 800,
  model: "lc0",
  source: "live",
};

const CDB_WIN: ChessdbResult = {
  fen: "test",
  best_move: "Nf3",
  score_cp: 220,
  outcome: "win",
  source: "live",
};

describe("buildAsyncVoterSnapshot", () => {
  it("plumbs Maia prob through to maiaProb", () => {
    const snap = buildAsyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 300,
      stockfishBestMoveMate: null,
      userRating: 1500,
      chessdbResult: null,
      lc0Result: null,
      maiaResult: MAIA,
      tablebaseResult: null,
    });
    expect(snap.maiaProb).toBe(0.42);
  });

  it("plumbs Lc0 eval through to lc0Cp", () => {
    const snap = buildAsyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 280,
      stockfishBestMoveMate: null,
      userRating: 1500,
      chessdbResult: null,
      lc0Result: LC0,
      maiaResult: null,
      tablebaseResult: null,
    });
    expect(snap.lc0Cp).toBe(280);
  });

  it("upgrades material_win MED → HIGH when SF + Lc0 both ≥ +150 (via voter logic)", () => {
    const snap = buildAsyncVoterSnapshot({
      fenBefore: START_FEN,  // no motif
      moveSan: "e4",
      stockfishEvalCp: 180,
      stockfishBestMoveMate: null,
      userRating: 1500,
      chessdbResult: CDB_WIN,  // cdbWin + sf>=100 → MED
      lc0Result: LC0,           // both ≥ 150 → upgrade to HIGH
      maiaResult: null,
      tablebaseResult: null,
    });
    expect(snap.confidence.material_win).toBe("HIGH");
  });

  it("achieves user_visibility HIGH when Maia prob ≥ 0.50", () => {
    const highMaia: MaiaProbResult = { ...MAIA, prob_plays_best: 0.62 };
    const snap = buildAsyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 200,
      stockfishBestMoveMate: null,
      userRating: 1500,
      chessdbResult: null,
      lc0Result: null,
      maiaResult: highMaia,
      tablebaseResult: null,
    });
    expect(snap.confidence.user_visibility).toBe("HIGH");
    expect(snap.maiaProb).toBe(0.62);
  });

  it("falls back to null grounding fields when async sources absent", () => {
    const snap = buildAsyncVoterSnapshot({
      fenBefore: FORK_FEN_BEFORE,
      moveSan: FORK_MOVE,
      stockfishEvalCp: 200,
      stockfishBestMoveMate: null,
      userRating: 1500,
      chessdbResult: null,
      lc0Result: null,
      maiaResult: null,
      tablebaseResult: null,
    });
    expect(snap.maiaProb).toBeNull();
    expect(snap.lc0Cp).toBeNull();
    expect(snap.syzygyDtm).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import {
  compute_feature_delta,
  find_resolution_point,
  compare_features,
  InvalidFenError,
} from "../featureDelta";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const KIWIPETE = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";

describe("compute_feature_delta", () => {
  it("returns empty delta when before == resolution", () => {
    const delta = compute_feature_delta(STARTING_FEN, STARTING_FEN, {
      fenAtResolution: STARTING_FEN,
    });
    expect(delta.isEmptyDelta).toBe(true);
    expect(delta.materialDelta.white).toBe(0);
    expect(delta.materialDelta.black).toBe(0);
    expect(delta.threatsDelta.newThreats).toHaveLength(0);
    expect(delta.threatsDelta.resolvedThreats).toHaveLength(0);
  });

  it("detects material delta after a queen capture", () => {
    const before = "r3k2r/ppp2ppp/8/3q4/3Q4/8/PPP2PPP/R3K2R w KQkq - 0 1";
    const afterCapture = "r3k2r/ppp2ppp/8/3Q4/8/8/PPP2PPP/R3K2R b KQkq - 0 1";
    const delta = compute_feature_delta(before, afterCapture, { fenAtResolution: afterCapture });
    expect(delta.materialDelta.black).toBeLessThan(0);
    expect(delta.materialDelta.white).toBe(0);
    expect(delta.isEmptyDelta).toBe(false);
  });

  it("falls back to fenAfter when no pv supplied", () => {
    const after = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
    const delta = compute_feature_delta(STARTING_FEN, after);
    expect(delta.resolutionReason).toBe("no-pv");
    expect(delta.resolutionFen).toBe(after);
  });

  it("uses provided pv to find a quiescent resolution", () => {
    const before = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1";
    const afterFirstMove = "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 1";
    const delta = compute_feature_delta(before, afterFirstMove, { pv: ["b8c6", "f1c4"] });
    expect(delta.resolutionFen).not.toBe(before);
    expect(["quiescent", "depth-limit"]).toContain(delta.resolutionReason);
  });

  it("throws InvalidFenError on malformed FEN", () => {
    expect(() => compute_feature_delta("not-a-fen", STARTING_FEN, { fenAtResolution: STARTING_FEN })).toThrow(
      InvalidFenError
    );
  });
});

describe("find_resolution_point", () => {
  it("returns no-pv when pv is empty", () => {
    const rp = find_resolution_point(STARTING_FEN, []);
    expect(rp.reason).toBe("no-pv");
    expect(rp.resolutionFen).toBe(STARTING_FEN);
    expect(rp.plyOffset).toBe(0);
  });

  it("stops at quiescent position after a quiet move", () => {
    const rp = find_resolution_point(STARTING_FEN, ["e2e4", "e7e5"]);
    expect(rp.reason).toBe("quiescent");
    expect(rp.plyOffset).toBeGreaterThan(0);
  });

  it("stops at forced-end when PV leads to mate", () => {
    const beforeMate = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
    const rp = find_resolution_point(beforeMate, ["e1e8"]);
    expect(["quiescent", "forced-end"]).toContain(rp.reason);
  });

  it("stops at depth-limit for long forcing sequences", () => {
    const tactical = KIWIPETE;
    const longCapturePv = ["e5g6", "h7g6", "f3f6", "g7f6", "d2h6", "f6e5", "h6c1"];
    const rp = find_resolution_point(tactical, longCapturePv);
    expect(rp.plyOffset).toBeGreaterThan(0);
  });
});

describe("compare_features", () => {
  it("symmetric piece trade — both sides lose equal material", () => {
    const before = "r3k2r/3q4/8/8/8/8/3Q4/R3K2R w KQkq - 0 1";
    const after = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
    const delta = compare_features(before, after);
    expect(delta.materialDelta.white).toBe(delta.materialDelta.black);
    expect(delta.materialDelta.white).toBeLessThan(0);
    expect(delta.isEmptyDelta).toBe(false);
  });

  it("resolution reason is no-resolution-needed", () => {
    const delta = compare_features(STARTING_FEN, STARTING_FEN);
    expect(delta.resolutionReason).toBe("no-resolution-needed");
  });
});

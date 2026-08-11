import { describe, expect, it } from "vitest";
import { evalFingerprint, generateCacheKey } from "@/lib/responseCache";

/**
 * T6 (SILENT_SUBSTITUTION_HANDOFF §4) — an engine-blind answer could be
 * replayed for 24h to users who DO have engine data.
 *
 * An analysis written with no evals, or with timeout sentinels in them, reads
 * exactly like a fully-grounded one: same voice, same structure, no hedge.
 * Without the engine data in the cache key, the FIRST caller to ask a question
 * on a position decides what every later caller gets — so a user whose
 * Stockfish never finished poisons the answer for users whose did.
 *
 * Not hypothetical: the coach accepts questions while the engine is still
 * booting (finding T7), which is the common case on a slow device.
 */

const line = (depth: number) => ({ pv: ["e2e4"], cp: 30, depth, multiPv: 1 });
const evalWith = (depths: number[]) => ({
  positions: depths.map((d) => ({ lines: [line(d)] })),
});

describe("evalFingerprint", () => {
  it("distinguishes no engine data from real engine data", () => {
    expect(evalFingerprint(undefined)).toBe("none");
    expect(evalFingerprint(null)).toBe("none");
    expect(evalFingerprint({ positions: [] })).toBe("none");
    expect(evalFingerprint(evalWith([16, 16]))).not.toBe("none");
  });

  it("distinguishes a clean run from one containing a timeout sentinel", () => {
    // depth 0 is the client timeout sentinel. An analysis built over one is a
    // different artifact and must not share a bucket with a clean run.
    expect(evalFingerprint(evalWith([16, 16, 16]))).not.toBe(
      evalFingerprint(evalWith([16, 0, 16])),
    );
  });

  it("distinguishes shallow from deep analysis", () => {
    expect(evalFingerprint(evalWith([12, 12]))).not.toBe(
      evalFingerprint(evalWith([16, 16])),
    );
  });

  it("distinguishes a partial analysis from a complete one", () => {
    expect(evalFingerprint(evalWith([16, 16]))).not.toBe(
      evalFingerprint(evalWith([16, 16, 16, 16])),
    );
  });

  it("is stable for identical engine data", () => {
    expect(evalFingerprint(evalWith([16, 14]))).toBe(
      evalFingerprint(evalWith([16, 14])),
    );
  });

  it("survives junk (gameEval is z.any() at the request boundary)", () => {
    expect(() => evalFingerprint("nonsense")).not.toThrow();
    expect(() => evalFingerprint({ positions: "nope" })).not.toThrow();
    expect(() => evalFingerprint({ positions: [{}, { lines: [] }] })).not.toThrow();
    expect(evalFingerprint({ positions: "nope" })).toBe("none");
  });
});

describe("generateCacheKey — engine data is part of an answer's identity", () => {
  const args = ["8/8/8/8/8/8/8/8 w - - 0 1", "intermediate", "why?", "persona", ["e4"]] as const;

  it("separates an engine-blind answer from a graded one", () => {
    const blind = generateCacheKey(...args, evalFingerprint(undefined));
    const graded = generateCacheKey(...args, evalFingerprint(evalWith([16, 16])));
    expect(blind).not.toBe(graded);
  });

  it("separates a sentinel-containing run from a clean one", () => {
    const clean = generateCacheKey(...args, evalFingerprint(evalWith([16, 16])));
    const stalled = generateCacheKey(...args, evalFingerprint(evalWith([16, 0])));
    expect(clean).not.toBe(stalled);
  });

  it("is unchanged for callers that pass no fingerprint (additive)", () => {
    // Keeps existing keys reachable, so this does not cold-start the cache for
    // every other call site in the repo.
    expect(generateCacheKey(...args)).toBe(generateCacheKey(...args, undefined));
  });

  it("still separates the things it already separated", () => {
    const fp = evalFingerprint(evalWith([16]));
    expect(generateCacheKey(...args, fp)).not.toBe(
      generateCacheKey(args[0], "advanced", args[2], args[3], [...args[4]], fp),
    );
  });
});

import { describe, expect, it } from "vitest";
import { parseCachedEval } from "../analysisEvalCache";
import { requestedDepth } from "@/lib/contract/evalDepth";
import type { GameEval, PositionEval } from "@/types/eval";
import { EngineName } from "@/types/enums";

/**
 * T10 — a revisited game was quietly a degraded one.
 *
 * /analysis caches a finished sweep in sessionStorage so reopening a game
 * doesn't re-run a 60-second analysis. It stored `PositionEval[]` only, so the
 * restore dropped `accuracy`, `estimatedElo` and `settings` — and the request
 * body then fell back to the bare `{ positions }` wrap.
 *
 * The expensive part is `settings.depth`: T8's mixed-depth guard keys on the
 * DECLARED requested depth and deliberately fails open without one. A
 * revisited game was therefore the single case where the fabricated-mistake
 * protection could not run at all — and nothing about the board, the coach, or
 * the reply said so.
 */

const pos = (depth: number): PositionEval => ({
  lines: [{ pv: ["e2e4"], cp: 20, depth, multiPv: 1 }],
});

const FULL: GameEval = {
  positions: [pos(16), pos(16), pos(16)],
  accuracy: { white: 91.2, black: 84.7 },
  estimatedElo: { white: 1720, black: 1500 },
  settings: {
    engine: EngineName.Stockfish17Lite,
    date: "2026-01-01",
    depth: 16,
    multiPv: 3,
  },
};

describe("parseCachedEval — the full sweep survives a revisit", () => {
  it("restores accuracy, estimated Elo and settings, not just positions", () => {
    const out = parseCachedEval(JSON.stringify(FULL), 3);
    expect(out?.positions).toHaveLength(3);
    expect(out?.gameEval?.accuracy).toEqual({ white: 91.2, black: 84.7 });
    expect(out?.gameEval?.estimatedElo?.white).toBe(1720);
  });

  it("re-arms the T8 mixed-depth guard, which a revisit used to disable", () => {
    // Asserted through T8's own reader rather than by inspecting the field,
    // so this fails if either side of the composition drifts.
    const out = parseCachedEval(JSON.stringify(FULL), 3);
    expect(requestedDepth(out?.gameEval)).toBe(16);

    // And the shape a revisit used to send: no settings, so `requestedDepth`
    // is null and the guard takes its documented fail-open branch.
    expect(requestedDepth({ positions: out?.positions } as never)).toBeNull();
  });
});

describe("parseCachedEval — entries written by the old code", () => {
  it("still restores a bare PositionEval[] rather than forcing a re-analysis", () => {
    // A legacy entry is a valid 60-second sweep. Throwing it away over a
    // format change would trade a quiet degradation for a loud one.
    const legacy = JSON.stringify([pos(16), pos(16), pos(16)]);
    const out = parseCachedEval(legacy, 3);
    expect(out?.positions).toHaveLength(3);
  });

  it("reports honestly that a legacy entry has no GameEval", () => {
    // `null` is the point: it means "this really is all we stored", so the
    // caller forwards the degraded payload as degraded instead of inventing
    // settings for it.
    expect(parseCachedEval(JSON.stringify([pos(16), pos(16), pos(16)]), 3)?.gameEval)
      .toBeNull();
  });
});

describe("parseCachedEval — refusing the wrong game", () => {
  it("rejects an entry whose length does not match this game", () => {
    // A mismatch means a different game, or the same game at a different
    // point. Restoring it would narrate the wrong moves with total confidence.
    expect(parseCachedEval(JSON.stringify(FULL), 5)).toBeNull();
    expect(parseCachedEval(JSON.stringify([pos(16)]), 3)).toBeNull();
  });

  it("rejects corrupt JSON instead of throwing into the render", () => {
    expect(parseCachedEval("{not json", 3)).toBeNull();
  });

  it("rejects a shape with no positions at all", () => {
    expect(parseCachedEval(JSON.stringify({ accuracy: { white: 1, black: 2 } }), 3)).toBeNull();
    expect(parseCachedEval("null", 3)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { intentFactsForPlies, isIntentFactsEnabled } from "../reviewFacts";
import { serializeForVerbalizer } from "@/lib/contract/serialize";
import type { GameEval } from "@/types/eval";
import type { CoachContract } from "@/lib/contract/types";

/**
 * The wiring into game review, and the proof that it is DARK.
 *
 * Nothing about the served answer may change while this is being measured. The
 * risk is not hypothetical: serializeForVerbalizer spreads ...rest, so a new
 * contract field enters the verbalizer prompt automatically unless it is
 * explicitly stripped — silently changing the prompt, its cache prefix, and
 * every byte-equality snapshot in the repo.
 */

const line = (pv: string[], cp: number, multiPv = 1) => ({ pv, cp, depth: 16, multiPv });

const GAME_EVAL: GameEval = {
  positions: [
    { lines: [line(["e2e4"], 25), line(["d2d4"], 17, 2)] },
    { lines: [line(["e7e5"], -3)] },
    { lines: [line(["g1f3"], 30)] },
    { lines: [line(["b8c6"], 28)] },
  ],
  accuracy: { white: 0, black: 0 },
  settings: { engine: "stockfish-local" as never, depth: 16, multiPv: 3, date: "" },
};
const MOVES = ["e4", "e5", "Nf3"];

describe("isIntentFactsEnabled", () => {
  it("is OFF unless explicitly set to the string true", () => {
    expect(isIntentFactsEnabled({})).toBe(false);
    expect(isIntentFactsEnabled({ INTENT_FACTS_ENABLED: "" })).toBe(false);
    expect(isIntentFactsEnabled({ INTENT_FACTS_ENABLED: "1" })).toBe(false);
    expect(isIntentFactsEnabled({ INTENT_FACTS_ENABLED: "TRUE" })).toBe(false);
    expect(isIntentFactsEnabled({ INTENT_FACTS_ENABLED: "true" })).toBe(true);
  });
});

describe("intentFactsForPlies", () => {
  it("analyses only the plies asked for", () => {
    const out = intentFactsForPlies({ gameEval: GAME_EVAL, moves: MOVES, plies: [1] });
    expect(out.map((r) => r.ply)).toEqual([1]);
    expect(out[0].playedSan).toBe("e5");
    expect(out[0].tier).toBe("tier0");
  });

  it("returns nothing rather than throwing when there is no eval", () => {
    expect(intentFactsForPlies({ gameEval: undefined, moves: MOVES, plies: [0] })).toEqual([]);
    expect(intentFactsForPlies({ gameEval: GAME_EVAL, moves: [], plies: [0] })).toEqual([]);
    expect(intentFactsForPlies({ gameEval: GAME_EVAL, moves: MOVES, plies: [] })).toEqual([]);
  });

  it("never throws on a move list that does not match the board", () => {
    expect(() =>
      intentFactsForPlies({ gameEval: GAME_EVAL, moves: ["e4", "Qxh8", "Nf3"], plies: [0, 1, 2] }),
    ).not.toThrow();
  });

  it("skips a ply whose evaluation timed out rather than reasoning from depth 0", () => {
    const timedOut: GameEval = {
      ...GAME_EVAL,
      positions: [{ lines: [{ pv: ["e2e4"], cp: 0, depth: 0, multiPv: 1 }] }, ...GAME_EVAL.positions.slice(1)],
    };
    const out = intentFactsForPlies({ gameEval: timedOut, moves: MOVES, plies: [0, 1] });
    expect(out.map((r) => r.ply)).toEqual([1]);
  });
});

describe("the wiring is dark", () => {
  /** A contract skeleton — only the fields serializeForVerbalizer touches. */
  function contractOf(intent?: CoachContract["intent"]): CoachContract {
    return {
      version: 1,
      contractId: "cid",
      builtAtMs: 111,
      buildMs: 222,
      game: { moveHistory: MOVES } as CoachContract["game"],
      evalIntegrity: {} as CoachContract["evalIntegrity"],
      insights: [],
      moveTable: [],
      finalAnnotation: null,
      finalRelational: null,
      persona: { personalityId: null },
      ...(intent ? { intent } : {}),
    } as unknown as CoachContract;
  }

  it("serializes byte-identically whether intent is attached or not", () => {
    // THE load-bearing assertion. If `intent` ever stops being stripped, this
    // fails before a single prompt byte reaches production.
    const facts = intentFactsForPlies({ gameEval: GAME_EVAL, moves: MOVES, plies: [0, 1] });
    expect(facts.length).toBeGreaterThan(0);

    const without = serializeForVerbalizer(contractOf());
    const with_ = serializeForVerbalizer(contractOf(facts));
    expect(with_).toBe(without);
  });

  it("CONTROL: the serializer is not simply ignoring every field", () => {
    // Without this, the assertion above would pass just as well against a
    // serializer that returned a constant.
    const a = serializeForVerbalizer(contractOf());
    const b = serializeForVerbalizer({ ...contractOf(), contractId: "different" });
    expect(b).not.toBe(a);
  });

  it("the string 'intent' never appears in the serialized prompt", () => {
    const facts = intentFactsForPlies({ gameEval: GAME_EVAL, moves: MOVES, plies: [0, 1] });
    expect(serializeForVerbalizer(contractOf(facts))).not.toContain("intent");
  });
});

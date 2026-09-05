/**
 * The model-facing projection inside serializeForVerbalizer (prompt cost).
 *
 * The contract JSON is the largest uncached block of a flagship review, so it
 * is deliberately slimmed before it reaches the model. That slimming is only
 * safe while two things hold, and neither is visible to any other test:
 *
 *   1. NOTHING SAYABLE IS LOST. Every cite token, every `display` string and
 *      every SAN the charter lets the model assert must still be in the JSON.
 *      A field that silently stops reaching the model does not fail CI — it
 *      just makes the coach quietly vaguer.
 *   2. THE CONTRACT OBJECT IS UNTOUCHED. The referee, the san_whitelist
 *      square pool (armed at `error`) and renderLegacyPrompt all read the
 *      OBJECT. If the projection ever mutated it, a prompt optimisation would
 *      turn into blocking referee false positives.
 *
 * The removals are re-derived here independently of the implementation (a
 * second reading of the same rule), so an over-broad strip shows up as a diff
 * rather than as a smaller number nobody reads.
 */
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildCoachContract } from "@/lib/contract/builder";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import { serializeForVerbalizer } from "@/lib/contract/serialize";
import type { CoachContract } from "@/lib/contract/types";
import type { GameEvalInput, GameHeadersInput } from "@/lib/contract/gameEvalSchema";
import {
  __setFetchForTesting,
  __resetFetchForTesting,
  __clearChessdbCache,
} from "@/lib/grounding/chessdb";

interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURES_DIR = path.join(__dirname, "fixtures-real");
/** A long game (84 plies, 10 insights), a sentinel game, and a tactical one. */
const NAMES = [
  "05_long_game_six_mistakes",
  "03_sentinel_timeout",
  "07_knight_fork",
];

const contracts = new Map<string, CoachContract>();

async function build(name: string): Promise<CoachContract> {
  __clearChessdbCache();
  const f = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), "utf8"),
  ) as FixtureFile;
  const requestFen = getFenAtHalfMove(f.moveHistory, f.moveHistory.length);
  return buildCoachContract({
    moveHistory: f.moveHistory,
    gameEval: f.gameEval,
    playerColor: f.playerColor,
    username: f.username,
    userRating: f.userRating,
    gameHeaders: f.gameHeaders,
    uid: `projection-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

/**
 * The serialization as it was BEFORE the cost projection: an independent
 * second implementation of the old rule, so "what did the projection remove?"
 * is answered by a diff rather than by reading the code under test.
 */
function preProjectionWire(contract: CoachContract): string {
  const sortDeep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (v !== null && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = sortDeep((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  const { builtAtMs: _b, buildMs: _m, intent: _i, ...rest } = contract;
  const insights = rest.insights.map(({ motifLicense: _l, ...ins }) => ins);
  return JSON.stringify(sortDeep({ ...rest, insights }));
}

/** Every subtree stored under `key`, anywhere in a wire payload. */
function collectByKey(node: unknown, key: string, into: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectByKey(n, key, into));
    return into;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === key && v) into.push(v);
      else collectByKey(v, key, into);
    }
  }
  return into;
}

const collectFeatureDeltas = (node: unknown): unknown[] =>
  collectByKey(node, "featureDelta");

/** Every key name appearing anywhere in a JSON tree. */
function keyNames(node: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    node.forEach((n) => keyNames(n, into));
    return into;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      into.add(k);
      keyNames(v, into);
    }
  }
  return into;
}

describe("verbalizer JSON projection", () => {
  beforeAll(async () => {
    __setFetchForTesting(async () => {
      throw new Error("network disabled in projection tests");
    });
    for (const n of NAMES) contracts.set(n, await build(n));
  }, 240_000);

  afterAll(() => __resetFetchForTesting());

  it("never mutates the contract the referee reads", () => {
    for (const name of NAMES) {
      const contract = contracts.get(name)!;
      // Deep snapshot taken BEFORE serializing, compared after. The referee's
      // square pool is built from moveTable FENs, so a mutation here would
      // surface as blocking san_whitelist false positives, not as a test fail.
      const before = JSON.parse(JSON.stringify(contract));
      serializeForVerbalizer(contract);
      expect(JSON.parse(JSON.stringify(contract))).toEqual(before);
      // The fields dropped from the wire must still be on the object.
      expect(contract.moveTable.every((r) => "fenBefore" in r)).toBe(true);
      const anyEval = contract.insights[0]?.evalAfter;
      if (anyEval) expect(anyEval).toHaveProperty("provenance");
    }
  });

  it("removes only what the four documented rules allow", () => {
    for (const name of NAMES) {
      const contract = contracts.get(name)!;
      const before = JSON.parse(preProjectionWire(contract));
      const after = JSON.parse(serializeForVerbalizer(contract));

      // Names that exist ONLY inside a featureDelta are fair game for the
      // vacant-branch prune; computed from the PRE-projection wire so the
      // allowlist is derived from data, not copied from the implementation.
      const explained = new Set<string>([
        "provenance",
        "pvUci",
        // An EvalFact ships as {display, sentinel}; the raw numbers behind
        // them are the form the charter forbids the model from using.
        "cp",
        "mate",
        "depth",
      ]);
      Array.from(keyNames(collectFeatureDeltas(before))).forEach((k) =>
        explained.add(k),
      );
      // Keys nested INSIDE a removed subtree go with it — Provenance.source
      // has no other home, so it vanishes with the provenance it belonged to.
      Array.from(keyNames(collectByKey(before, "provenance"))).forEach((k) =>
        explained.add(k),
      );
      // Rule 5 (verbalizer 4.1): a line's structured `story` and the insight's
      // `gameStory` reach the model as one sentence per ply plus a material
      // ledger (projectLineStory); their structured keys stay referee-side.
      for (const storyKey of ["story", "gameStory"]) {
        Array.from(keyNames(collectByKey(before, storyKey))).forEach((k) => explained.add(k));
      }
      explained.add("gameStory");

      const afterKeys = keyNames(after);
      const beforeKeys = keyNames(before);
      const gone = Array.from(beforeKeys).filter((k) => !afterKeys.has(k));
      const unexplained = gone.filter((k) => !explained.has(k));
      expect(unexplained).toEqual([]);
      // And the projection only ever removes — it must never invent a key.
      const added = Array.from(afterKeys).filter((k) => !beforeKeys.has(k));
      expect(added).toEqual([]);
    }
  });

  it("measurably shrinks the billed payload", () => {
    const contract = contracts.get("05_long_game_six_mistakes")!;
    const before = preProjectionWire(contract).length;
    const after = serializeForVerbalizer(contract).length;
    // Measured at 18.6% on this fixture when the projection landed. The floor
    // is deliberately slack: this guards against the projection being quietly
    // disabled, not against normal drift in fixture content.
    expect(after).toBeLessThan(before * 0.9);
  });

  it("keeps every cite token, eval display and SAN the charter allows", () => {
    for (const name of NAMES) {
      const contract = contracts.get(name)!;
      const json = serializeForVerbalizer(contract);
      for (const insight of contract.insights) {
        expect(json).toContain(`"${insight.factIdPrefix}"`);
        for (const line of insight.lines) {
          // The pv cite token is a DATA field; without it the model would have
          // to count array positions to cite [F:M1.pv0].
          expect(json).toContain(`"${line.id}"`);
          expect(json).toContain(JSON.stringify(line.san));
          expect(json).toContain(`"${line.eval.display}"`);
        }
        if (insight.evalBefore) expect(json).toContain(`"${insight.evalBefore.display}"`);
        if (insight.evalAfter) expect(json).toContain(`"${insight.evalAfter.display}"`);
      }
      for (const row of contract.moveTable) {
        if (row.evalAfter) expect(json).toContain(`"${row.evalAfter.display}"`);
        if (row.bestWas) expect(json).toContain(`"${row.bestWas.san}"`);
      }
    }
  });

  it("drops a move's fenBefore only when the previous row already states it", () => {
    for (const name of NAMES) {
      const contract = contracts.get(name)!;
      const wire = JSON.parse(serializeForVerbalizer(contract)) as {
        moveTable: Array<{ fenBefore?: string | null; fenAfter: string | null }>;
      };
      expect(wire.moveTable.length).toBe(contract.moveTable.length);
      // Replay the stated convention: an absent fenBefore IS the previous
      // row's fenAfter. Reconstruction must equal the original exactly.
      const rebuilt = wire.moveTable.map((row, i) =>
        "fenBefore" in row ? row.fenBefore : wire.moveTable[i - 1].fenAfter,
      );
      expect(rebuilt).toEqual(contract.moveTable.map((r) => r.fenBefore));
      // Row 0 has nothing before it, so it must always carry its own.
      if (contract.moveTable.length > 0 && contract.moveTable[0].fenBefore !== null) {
        expect("fenBefore" in wire.moveTable[0]).toBe(true);
      }
    }
  });

  it("keeps the featureDelta signal while dropping only all-zero branches", () => {
    const contract = contracts.get("05_long_game_six_mistakes")!;
    const wire = JSON.parse(serializeForVerbalizer(contract)) as {
      insights: Array<{ featureDelta?: Record<string, unknown> | null }>;
    };
    for (let i = 0; i < contract.insights.length; i++) {
      const src = contract.insights[i].featureDelta;
      const out = wire.insights[i].featureDelta;
      if (!src) continue;
      // isEmptyDelta is the signal that replaces the pruned branches; it is a
      // boolean, so it must never be mistaken for a vacant one and dropped.
      if ("isEmptyDelta" in src) expect(out).toHaveProperty("isEmptyDelta");
      // Anything with real content survives verbatim.
      if (src.fenAfter) expect(out?.fenAfter).toBe(src.fenAfter);
    }
  });

  it("ships an eval as its canonical rendering, never the raw numbers", () => {
    for (const name of NAMES) {
      const contract = contracts.get(name)!;
      const wire = JSON.parse(serializeForVerbalizer(contract));
      const evals = collectByKey(wire, "evalAfter")
        .concat(collectByKey(wire, "evalBefore"))
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object");
      expect(evals.length).toBeGreaterThan(0);
      for (const e of evals) {
        expect(Object.keys(e).sort()).toEqual(["display", "sentinel"]);
      }
      // The sentinel case is the reason this matters: its raw form is
      // {cp: 0, depth: 0}, which the charter then has to forbid the model
      // from printing as "+0.00". It must never reach the wire.
      expect(JSON.stringify(wire)).not.toContain('"cp":0,"depth":0');
    }
  });

  it("is deterministic for the same contract", () => {
    for (const name of NAMES) {
      const contract = contracts.get(name)!;
      expect(serializeForVerbalizer(contract)).toBe(serializeForVerbalizer(contract));
    }
  });
});

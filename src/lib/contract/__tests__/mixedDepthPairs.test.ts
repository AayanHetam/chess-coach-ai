import { describe, expect, it } from "vitest";
import { buildCoachContract } from "../builder";
import { selectInsights } from "../selectInsights";
import type { GameEvalInput } from "../gameEvalSchema";

/**
 * T8 — silent depth substitution (SILENT_SUBSTITUTION_HANDOFF.md §4).
 *
 * `uciEngine.evaluateGame` gives each position a 30s budget. On a timeout it
 * aborts and retries ONCE at `max(8, depth - 4)`, then merges that shallower
 * result into `positions[]` indistinguishably from its neighbours — while
 * `settings.depth` is still stamped with the depth that was REQUESTED.
 *
 * Every swing scan then subtracts two evals that were never comparable. A
 * position searched to d16 minus one searched to d12 routinely differs by
 * 50-150cp on its own, which is precisely the band the scans call an
 * inaccuracy or a mistake. The user is told they erred on a move where the
 * only thing that changed was how long the engine got to think.
 *
 * This is the sentinel bug's quieter sibling. A sentinel at least announces
 * itself with `depth: 0`; a retry looks like an ordinary evaluation, and the
 * difference is only visible by comparing the two depths to each other.
 *
 * Only reproducible on slow devices, which is why no eval fixture contains it.
 */

const line = (cp: number, depth: number) => ({ pv: ["e2e4"], cp, depth, multiPv: 1 });
const moveHistory = ["e4", "e5", "Nf3", "Nc6"];

/**
 * `evaluateGame` stamps this on every payload it returns, with the depth that
 * was REQUESTED — which is the whole reason the retry is invisible downstream.
 * It is also what makes the retry detectable: a position below the declared
 * depth is one the engine did not finish.
 */
const SETTINGS = { engine: "stockfish-17", date: "2026-01-01", depth: 16, multiPv: 3 };

/**
 * A quiet, level game: +0.30 for White at every position when each is searched
 * to the same depth. Nobody blundered; there is no mistake here to find.
 *
 * Index 1 is the position whose search timed out and was retried at d12, where
 * the evaluation reads -0.90 — a 120cp disagreement that is an artifact of the
 * search, not of the move that was played.
 *
 * Index 1 (not 2) for the same reason as the C4 fixture: the drop for ply `i`
 * is positions[i] vs positions[i+1], so a value at index 1 fabricates a swing
 * TWICE — once as ply 0 falling into it, once as ply 1 climbing out.
 */
function evalWithShallowRetry(): GameEvalInput {
  const positions = [0, 1, 2, 3, 4].map(() => ({
    bestMove: "e2e4",
    lines: [line(30, 16)],
  }));
  positions[1] = { bestMove: "e2e4", lines: [line(-90, 12)] };
  return { positions, settings: SETTINGS };
}

describe("T8 — swing scans must not compare evals from different depths", () => {
  it("the fixture really does fabricate a mistake (guards against a vacuous test)", () => {
    // Identical numbers, uniform depth. If these plies are NOT selected here,
    // the fixture produces nothing interesting and the tests below would pass
    // for the wrong reason.
    const uniformDepth: GameEvalInput = {
      positions: evalWithShallowRetry().positions.map((p) => ({
        ...p,
        lines: [{ ...p.lines[0], depth: 16 }],
      })),
      settings: SETTINGS,
    };
    const { topMistakes, intelligenceTop3 } = selectInsights(moveHistory, uniformDepth, "w");
    expect(topMistakes.map((m) => m.ply)).toContain(0);
    expect(intelligenceTop3.map((i) => i.ply)).toContain(0);
  });

  it("does not report a mistake built from a d16 vs d12 comparison", () => {
    const { topMistakes } = selectInsights(moveHistory, evalWithShallowRetry(), "w");
    expect(topMistakes.map((m) => m.ply)).not.toContain(0);
  });

  it("does not let the same artifact into the chess-intelligence top 3", () => {
    const { intelligenceTop3 } = selectInsights(moveHistory, evalWithShallowRetry(), "w");
    const plies = intelligenceTop3.map((i) => i.ply);
    expect(plies).not.toContain(0);
    expect(plies).not.toContain(1);
  });

  it("still reports a real mistake when the whole sweep is uniformly shallow", () => {
    // The rule is "the two depths differ", NOT "the depth is low". A d12 sweep
    // is a perfectly valid analysis of a game; suppressing its mistakes would
    // trade this fabrication for a silent omission, which is the same class of
    // bug pointing the other way.
    const uniformlyShallow: GameEvalInput = {
      positions: [line(30, 12), line(-400, 12), line(-400, 12), line(-400, 12), line(-400, 12)].map(
        (l) => ({ bestMove: "e2e4", lines: [l] }),
      ),
      settings: { ...SETTINGS, depth: 12 },
    };
    const { topMistakes } = selectInsights(moveHistory, uniformlyShallow, "w");
    expect(topMistakes.map((m) => m.ply)).toContain(0);
  });

  it("admits the pair when the payload declares no requested depth", () => {
    // "Shallow" is only meaningful against a depth that was asked for. With no
    // `settings`, inferring the intended depth from the data would be the very
    // move this programme exists to remove — substituting a plausible value
    // for a missing one and then acting on it as if it were known.
    //
    // Every payload `evaluateGame` produces declares one, so this branch is
    // reachable only from the partial `{positions}` payload the client sends
    // mid-sweep (see T7) and from hand-authored fixtures. Pinned so the
    // fail-open is a decision on the record rather than an accident.
    const undeclared: GameEvalInput = { positions: evalWithShallowRetry().positions };
    const { topMistakes } = selectInsights(moveHistory, undeclared, "w");
    expect(topMistakes.map((m) => m.ply)).toContain(0);
  });
});

describe("T8 — the contract's move table carries no classification for a mixed-depth pair", () => {
  /**
   * `moveClassification` is attached client-side by `getMovesClassification`,
   * which reads exactly the pair the swing scans above now refuse. Suppressing
   * the drop while forwarding the label would leave the fabrication intact and
   * merely change which line of the prompt states it.
   *
   * The builder is the place to do it, not the renderer: the referee validates
   * prose AGAINST the contract, so any label that reaches this object is one
   * the referee will certify as backed. Cited means consistent-with-the-
   * contract; it never means true.
   */
  async function classificationAt(retryDepth: number, ply: number) {
    const positions = [0, 1, 2, 3, 4].map(() => ({
      bestMove: "e2e4",
      lines: [line(30, 16)],
    })) as GameEvalInput["positions"];
    positions[ply + 1] = {
      bestMove: "e2e4",
      lines: [line(-90, retryDepth)],
      moveClassification: "blunder",
    };
    const contract = await buildCoachContract({
      moveHistory,
      gameEval: { positions, settings: SETTINGS },
      playerColor: "w",
    });
    return contract.moveTable.find((m) => m.ply === ply)?.classification ?? null;
  }

  it("forwards the classification when both searches are the same size", async () => {
    expect(await classificationAt(16, 0)).toBe("blunder");
  });

  it("drops it when the engine had to retry one of the two positions", async () => {
    expect(await classificationAt(12, 0)).toBeNull();
  });
});

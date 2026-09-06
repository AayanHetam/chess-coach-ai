/**
 * PR-CI-6a — follow-up grounding.
 *
 * The first block is a CONTROL, not a feature test. Everything else here
 * asserts that the new renderer behaves; the control asserts that the gap it
 * fills was real — that the legacy follow-up grounding genuinely drops the
 * engine's continuation even when the client payload contained it. Without
 * that, a green suite would only prove the new code runs, not that it adds
 * anything (see the "a green test proves nothing until you've watched it
 * fail" lesson from the CI-4 gate misses).
 */
import { describe, it, expect } from "vitest";
import { buildCompactGameContext } from "@/lib/coach/compactGameContext";
import type { GameEvalInput } from "@/lib/contract/gameEvalSchema";
import {
  toCompactContract,
  renderContractCompact,
  CONTRACT_COMPACT_MAX_CHARS,
} from "@/lib/contract/followUp";
import { makeContract, makeInsight, lineFact } from "./insightFactory";
import { buildLineStory } from "@/lib/contract/lineStory";

/**
 * Ground truth shared by both halves of the control: a 6-ply Italian in which
 * White's 3rd move (Bc4) is a 430cp blunder, with the engine preferring the
 * line Nxe5 Nxe5 Qh5.
 *
 * The token that matters is **Qh5** — the PV's third ply. It is never played
 * in the game, so any renderer emitting it can only have read it from the PV.
 * **Nxe5** is the second probe: it is the best MOVE, which the legacy renderer
 * does surface. Together they make the control precise rather than vacuous —
 * the legacy path is not ignoring the payload, it gives you the best move and
 * then stops. What it can never answer is "and then what?", which is the most
 * common follow-up a user asks.
 */
const MOVE_HISTORY = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"];
const PV_UCI = ["f3e5", "c6e5", "d1h5"];
const PV_SAN = ["Nxe5", "Nxe5", "Qh5"];

/** Client Stockfish payload carrying the full PV on the pre-blunder position. */
const GAME_EVAL: GameEvalInput = {
  positions: MOVE_HISTORY.map((_, i) => ({
    // Index 4 is the position BEFORE White's blundering 3rd move.
    bestMove: i === 4 ? "f3e5" : undefined,
    lines: [
      {
        pv: i === 4 ? PV_UCI : [],
        // +0.30 before Bc4, -4.00 after: a 430cp drop, so the move lands in
        // TOP MISTAKES and the legacy best-move branch actually runs.
        cp: i === 5 ? -400 : 30,
        depth: 16,
        multiPv: 1,
      },
    ],
  })),
  accuracy: { white: 88.2, black: 81.4 },
};

const INSIGHT_WITH_PV = makeInsight({
  factIdPrefix: "M1",
  moveNumber: 3,
  color: "w",
  colorName: "White",
  playedSan: "Bc4",
  bestSan: "Nxe5",
  lines: [lineFact("M1.pv0", PV_SAN, PV_UCI, { cp: 30, display: "+0.30" })],
});

describe("CONTROL — the legacy follow-up path drops the engine's line", () => {
  it("buildCompactGameContext gives the best MOVE but never the best LINE", () => {
    const legacy = buildCompactGameContext(MOVE_HISTORY, GAME_EVAL, "w");

    // Sanity: the renderer ran, saw this game, and reached its mistake branch.
    expect(legacy).toContain("1. e4 e5");
    expect(legacy).toContain("Nxe5");

    // The gap. compactGameContext's own docstring says "no full PV trees";
    // this pins that as behaviour rather than prose. "Qh5" is reachable only
    // from PV_UCI[2], so its absence IS the missing continuation.
    expect(legacy).not.toContain("Qh5");
  });

  it("renderContractCompact surfaces that same continuation", () => {
    const compact = toCompactContract(makeContract([INSIGHT_WITH_PV]), ["M1"]);
    const rendered = renderContractCompact(compact);

    expect(rendered).toContain("Qh5");
    expect(rendered).toContain("engine line:");
  });
});

describe("toCompactContract", () => {
  it("copies eval displays verbatim rather than re-deriving them", () => {
    // Load-bearing: the referee's eval_display check whitelists exactly the
    // EvalFact.display strings. A follow-up that re-formats "+1.38" as "1.4"
    // would be unverifiable against the contract it came from.
    const contract = makeContract([makeInsight({})]);
    const compact = toCompactContract(contract, ["M1"]);
    expect(compact.insights[0].evalBeforeDisplay).toBe("+1.38");
    expect(compact.insights[0].evalAfterDisplay).toBe("-2.12");
    expect(renderContractCompact(compact)).toContain("+1.38");
  });

  it("carries forbidden claim classes from every degraded source", () => {
    // The factory ships lc0 unconfigured (positional_plan), syzygy
    // not_applicable (endgame_wdl), visibility unconfigured (user_visibility).
    const compact = toCompactContract(makeContract([makeInsight({})]), ["M1"]);
    expect(compact.forbiddenClaimClasses).toEqual([
      "endgame_wdl",
      "positional_plan",
      "user_visibility",
    ]);
    expect(renderContractCompact(compact)).toContain("DO NOT CLAIM");
  });

  it("marks shipped vs unshipped insights, and stays silent when unknown", () => {
    const contract = makeContract([
      makeInsight({ factIdPrefix: "M1", severityDropCp: 400 }),
      makeInsight({ factIdPrefix: "M2", severityDropCp: 200 }),
    ]);

    const known = renderContractCompact(toCompactContract(contract, ["M1"]));
    expect(known).toContain("[M1] shown as a card");
    expect(known).toContain("[M2] engine found this, NOT shown to the user");

    // Cache-hit serve: the shipped set is genuinely unavailable. Asserting
    // either way would be a fabrication — the marker must simply be absent.
    const unknown = renderContractCompact(toCompactContract(contract, null));
    expect(unknown).toContain("[M1] move");
    expect(unknown).not.toContain("shown as a card");
    expect(unknown).not.toContain("NOT shown to the user");
  });

  it("orders shipped cards first, then by severity", () => {
    const contract = makeContract([
      makeInsight({ factIdPrefix: "M1", severityDropCp: 100 }),
      makeInsight({ factIdPrefix: "M2", severityDropCp: 900 }),
      makeInsight({ factIdPrefix: "M3", severityDropCp: 500 }),
    ]);
    const compact = toCompactContract(contract, ["M1"]);
    expect(compact.insights.map((i) => i.factId)).toEqual(["M1", "M2", "M3"]);
  });

  it("truncates long PVs and flags that it did", () => {
    const long = Array.from({ length: 14 }, (_, i) => `N${i}`);
    const contract = makeContract([
      makeInsight({ lines: [lineFact("M1.pv0", long, [], { cp: 10, display: "+0.10" })] }),
    ]);
    const compact = toCompactContract(contract, ["M1"]);
    expect(compact.insights[0].bestLineSan).toHaveLength(8);
    expect(compact.insights[0].bestLineTruncated).toBe(true);
    expect(renderContractCompact(compact)).toContain("(line continues)");
  });

  it("prefers the engine's best line over the played line", () => {
    const contract = makeContract([makeInsight({})]);
    const compact = toCompactContract(contract, ["M1"]);
    // Factory pv0 = Ne6 Qd7 Nxg7 (best); pv1 = Bd3 Qd4+ (isPlayedLine).
    expect(compact.insights[0].bestLineSan).toEqual(["Ne6", "Qd7", "Nxg7"]);
  });
});

describe("renderContractCompact — budget and honesty", () => {
  it("never exceeds the char budget, and says so when it drops findings", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      makeInsight({ factIdPrefix: `M${i}`, severityDropCp: 1000 - i }),
    );
    const compact = toCompactContract(makeContract(many), []);
    const rendered = renderContractCompact(compact, 1200);

    expect(rendered.length).toBeLessThanOrEqual(1200);
    // Silent truncation is the failure mode: a shortened list that reads as
    // complete would have the model conclude the omitted moves were fine.
    expect(rendered).toMatch(/further engine finding/);
  });

  it("keeps the forbidden-claims tail even when insights are dropped", () => {
    const many = Array.from({ length: 10 }, (_, i) => makeInsight({ factIdPrefix: `M${i}` }));
    const rendered = renderContractCompact(toCompactContract(makeContract(many), []), 900);
    expect(rendered).toContain("DO NOT CLAIM");
  });

  it("tells the model not to name the block (live-fire leak, 2026-08-12)", () => {
    // The first production follow-up answered "From the review fact contract,
    // here's the engine's line..." — facts correct, voice broken. The chat
    // prompt is v3.x and knows nothing about this block, so the anti-leak
    // instruction has to travel inside the block itself.
    const rendered = renderContractCompact(
      toCompactContract(makeContract([makeInsight({})]), ["M1"]),
    );
    expect(rendered).toMatch(/NEVER mention this block/);
    expect(rendered).toMatch(/never "according to the contract"/);
  });

  it("keeps the anti-leak instruction even at the tightest budget", () => {
    // It lives in the header, which is never dropped — pin that, because a
    // truncation that sheds the instruction reintroduces the leak silently.
    const many = Array.from({ length: 10 }, (_, i) => makeInsight({ factIdPrefix: `M${i}` }));
    const rendered = renderContractCompact(toCompactContract(makeContract(many), []), 900);
    expect(rendered).toMatch(/NEVER mention this block/);
  });

  it("renders move numbers correctly for a black-to-move line", () => {
    const contract = makeContract([
      makeInsight({
        moveNumber: 12,
        color: "b",
        colorName: "Black",
        lines: [lineFact("M1.pv0", ["Nf6", "Bg5", "h6"], [], { cp: 10, display: "+0.10" })],
      }),
    ]);
    const rendered = renderContractCompact(toCompactContract(contract, ["M1"]));
    expect(rendered).toContain("12...Nf6 13.Bg5 h6");
  });
});

describe("line stories in the follow-up (2026-09-05)", () => {
  // Real board: the Italian control position before 3.Bc4, PV Nxe5 Nxe5 Qh5,
  // and the game's own continuation Bc4 Bc5 — both narrated by lineStory.
  const fenBeforeBc4 = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
  const insight = makeInsight({
    factIdPrefix: "M1",
    moveNumber: 3,
    color: "w",
    colorName: "White",
    playedSan: "Bc4",
    bestSan: "Nxe5",
    fenBefore: fenBeforeBc4,
    lines: [{ ...lineFact("M1.pv0", PV_SAN, PV_UCI, { cp: 30, display: "+0.30" }), story: buildLineStory(fenBeforeBc4, PV_SAN) }],
    gameStory: buildLineStory(fenBeforeBc4, ["Bc4", "Bc5"]),
  });

  it("carries what the best line does, and what the game did next, in coach words without labels", () => {
    const compact = toCompactContract(makeContract([insight]), ["M1"]);
    expect(compact.insights[0].bestLineStory[0]).toContain("3.Nxe5 — takes the pawn on e5");
    expect(compact.insights[0].bestLineStory.some((l) => l.startsWith("after these moves: "))).toBe(true);
    expect(compact.insights[0].bestLineStory.some((l) => /^s\d/.test(l) || l.startsWith("material:"))).toBe(false);
    expect(compact.insights[0].gameStory[0]).toContain("3.Bc4");
    const rendered = renderContractCompact(compact);
    expect(rendered).toContain("what the engine line does:");
    expect(rendered).toContain("    - 3.Nxe5 — takes the pawn on e5");
    // the guidance rides only with a story, and the legacy budget tests keep their tight header
    expect(rendered).toContain("what the game did next:");
  });

  it("a contract built before stories existed renders exactly as it did", () => {
    const legacy = toCompactContract(makeContract([INSIGHT_WITH_PV]), ["M1"]);
    expect(legacy.insights[0].bestLineStory).toEqual([]);
    expect(legacy.insights[0].gameStory).toEqual([]);
    const rendered = renderContractCompact(legacy);
    expect(rendered).not.toContain("what the engine line does");
    expect(rendered).toContain("engine line:");
  });

  it("under budget, stories go before insights do", () => {
    const second = makeInsight({ factIdPrefix: "M2", moveNumber: 9, color: "b", topMistakeRank: 2 });
    const compact = toCompactContract(makeContract([insight, second]), ["M1"]);
    const full = renderContractCompact(compact);
    expect(full).toContain("what the engine line does:");
    expect(full).toContain("[M2]");
    // Tighten until the stories no longer fit: both insights must still be there.
    const withoutStories = renderContractCompact({
      ...compact,
      insights: compact.insights.map((i) => ({ ...i, bestLineStory: [], gameStory: [] })),
    });
    const tight = renderContractCompact(compact, withoutStories.length + 10);
    expect(tight).toContain("[M1]");
    expect(tight).toContain("[M2]");
    expect(tight).not.toContain("what the engine line does");
    expect(tight).not.toContain("omitted for length");
  });

  it("tells the model how to use the lists, and not to read the labels aloud", () => {
    const rendered = renderContractCompact(toCompactContract(makeContract([insight]), ["M1"]));
    expect(rendered).toContain("Explain a line through those facts");
    expect(rendered).toContain("quiet move");
    expect(rendered).toContain('Never read "after these moves"');
  });
});

describe("memory bound (plan §7 gate: 50 cached contexts)", () => {
  it("a trimmed contract stays well under 60KB", () => {
    // The full CoachContract carries threat trees, every multipv line, the
    // move table and feature deltas. analysisContextCache holds 50 entries in
    // a serverless instance's memory, so the trim is what makes storing it
    // safe at all.
    const insights = Array.from({ length: 12 }, (_, i) =>
      makeInsight({ factIdPrefix: `M${i}` }),
    );
    const full = makeContract(insights);
    const compact = toCompactContract(full, ["M0"]);

    const compactBytes = Buffer.byteLength(JSON.stringify(compact), "utf8");
    const fullBytes = Buffer.byteLength(JSON.stringify(full), "utf8");

    expect(compactBytes).toBeLessThan(60_000);
    expect(compactBytes).toBeLessThan(fullBytes);
    // 50 of these must not be a memory event on a shared instance.
    expect(compactBytes * 50).toBeLessThan(3_000_000);
  });

  it("the rendered block fits the per-turn token budget", () => {
    const insights = Array.from({ length: 12 }, (_, i) =>
      makeInsight({ factIdPrefix: `M${i}` }),
    );
    const compact = toCompactContract(makeContract(insights), ["M0"]);
    // It rides UNCACHED on every follow-up turn — this is a recurring cost.
    expect(renderContractCompact(compact).length).toBeLessThanOrEqual(
      CONTRACT_COMPACT_MAX_CHARS,
    );
  });
});

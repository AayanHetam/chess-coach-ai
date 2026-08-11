/**
 * PR-CI-5 sentinel guard — "cited ≠ true".
 *
 * The upstream defect (owned elsewhere): a client Stockfish timeout returns
 * `{pv: [], depth: 0, cp: 0}`. selectInsights Scan 2 does not skip it, so the
 * insight it produces carries a `classification` and `severityDropCp` computed
 * against that fake 0. The referee validates prose AGAINST the contract, so
 * prose repeating the fabrication is cited, consistent, and wrong.
 *
 * These tests pin BOTH halves of the CI-5 refusal:
 *   1. the card plan never contains a sentinel-bearing insight;
 *   2. a model-emitted block whose header names one cannot ANCHOR to it (the
 *      path that would otherwise hand it a server-authoritative header
 *      carrying the fabricated classification).
 *
 * The first case uses the REAL vendored fixture (03_sentinel_timeout), so the
 * test fails if the upstream fix lands and the exposure genuinely disappears —
 * which is the signal we want, not a silent pass on a synthetic.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createEnforcedContractStream,
  SENTINEL_REFUSAL_NOTE,
} from "@/lib/contract/enforcedStream";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import {
  isSentinelBearingInsight,
  partitionSentinelCards,
  sentinelBearingInsights,
} from "@/lib/contract/sentinelGuard";
import {
  buildVerbalizerUserTurn,
  selectCardInsights,
  selectCardInsightsDetailed,
} from "@/lib/prompts/verbalizerPrompt";
import type { CoachContract } from "@/lib/contract/types";
import { evalFact, makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: { child: () => ({ info: () => {}, warn: () => {}, error: () => {} }) },
}));

const FIXTURES_DIR = path.join(process.cwd(), "src/lib/contract/__tests__/fixtures");

async function buildFixtureContract(file: string): Promise<CoachContract> {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  const chessdb = await import("@/lib/grounding/chessdb");
  chessdb.__setFetchForTesting(async () => {
    throw new Error("network disabled in sentinelGuard.test");
  });
  chessdb.__clearChessdbCache();
  const { buildCoachContract } = await import("@/lib/contract/builder");
  const { getFenAtHalfMove } = await import("@/lib/contract/chessFormat");
  const f = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, file), "utf8"));
  return buildCoachContract({
    moveHistory: f.moveHistory,
    gameEval: f.gameEval,
    playerColor: f.playerColor,
    username: f.username,
    userRating: f.userRating,
    gameHeaders: f.gameHeaders,
    uid: "sentinel-guard-test",
    identity: {
      fen: getFenAtHalfMove(f.moveHistory, f.moveHistory.length),
      playerColor: f.playerColor || "w",
    },
  });
}

describe("isSentinelBearingInsight", () => {
  it("flags a sentinel on EITHER end — the drop is a difference", () => {
    expect(isSentinelBearingInsight(makeInsight())).toBe(false);
    expect(
      isSentinelBearingInsight(
        makeInsight({ evalBefore: evalFact({ sentinel: true, display: "engine data unavailable" }) }),
      ),
    ).toBe(true);
    expect(
      isSentinelBearingInsight(
        makeInsight({ evalAfter: evalFact({ sentinel: true, display: "engine data unavailable" }) }),
      ),
    ).toBe(true);
  });
});

describe("card plan is sentinel-free on the real fixtures", () => {
  /**
   * HISTORY — read before "simplifying" this file.
   *
   * When this guard was written (2026-08-11, on main @704947e) fixture 03 DID
   * build a sentinel-bearing card: `I3`, classification "inaccuracy",
   * severityDropCp 80, from an `evalBefore` sentinel — reached the enforced
   * card plan, and the CI-5 gate run measured the guard refusing it 3 times
   * (once per sample).
   *
   * PR #275 (`fix/group-c-sentinel-guards`) then landed the upstream fix: C4
   * added the sentinel skip to `selectInsights` Scan 2, which is where those
   * insights were born. So the corpus no longer produces one, and this guard
   * is now DEFENCE IN DEPTH rather than the only thing standing between a
   * client timeout and a "BLUNDER" label.
   *
   * Both layers stay tested. This block pins the UPSTREAM property (Scan 2
   * skips sentinels — a regression here is C4 being reverted); the synthetic
   * blocks below pin the guard's OWN behaviour, which the fixtures can no
   * longer exercise.
   */
  it("03_sentinel_timeout: no sentinel-bearing insight survives selection (pins C4)", async () => {
    const contract = await buildFixtureContract("03_sentinel_timeout.json");
    // The fixture still contains timeout sentinels...
    expect(contract.evalIntegrity.sentinelPlies.length).toBeGreaterThan(0);
    // ...but Scan 2 now skips them, so none becomes an insight at all.
    expect(sentinelBearingInsights(contract)).toEqual([]);
    // Every sentinel insight would be INTEL-ONLY anyway (Scan 1 always
    // skipped them), so neither layer can ever cost a top mistake.
    for (const i of sentinelBearingInsights(contract)) expect(i.topMistakeRank).toBeNull();
  });

  it("the guard is a no-op on the current corpus — and says so", async () => {
    for (const f of ["03_sentinel_timeout.json", "09_legal_trap_tactics.json"]) {
      const detailed = selectCardInsightsDetailed(await buildFixtureContract(f));
      expect(detailed.droppedSentinel).toEqual([]);
      expect(detailed.cards.some(isSentinelBearingInsight)).toBe(false);
    }
  });

  it("no sentinel-bearing card can reach the verbalizer CARD PLAN", async () => {
    const contract = await buildFixtureContract("03_sentinel_timeout.json");
    const detailed = selectCardInsightsDetailed(contract);
    const turn = buildVerbalizerUserTurn({ contract, messageText: "analyze my game" });
    for (const refused of detailed.droppedSentinel) {
      expect(turn).not.toContain(renderInsightHeader(refused));
    }
    for (const kept of detailed.cards) {
      expect(turn).toContain(renderInsightHeader(kept));
    }
    expect(selectCardInsights(contract).some(isSentinelBearingInsight)).toBe(false);
  });
});

describe("if the upstream skip regressed, the guard still refuses the card", () => {
  /** The exact shape fixture 03 produced before PR #275: an intel-only
   * insight whose evalBefore is a timeout sentinel, so its classification and
   * severity are derived from a fake cp:0. */
  const asIfC4Reverted = makeInsight({
    factIdPrefix: "I3",
    moveNumber: 12,
    color: "b",
    playedSan: "Nf6",
    topMistakeRank: null,
    intelligenceRank: 3,
    classification: "inaccuracy",
    evalBefore: evalFact({ sentinel: true, cp: 0, depth: 0, display: "engine data unavailable" }),
  });

  it("refuses it, and its header WOULD have carried a fabricated classification", () => {
    const good = makeInsight({ factIdPrefix: "M1", topMistakeRank: 1 });
    const contract = makeContract([good, asIfC4Reverted]);
    const detailed = selectCardInsightsDetailed(contract);

    expect(detailed.droppedSentinel.map((i) => i.factIdPrefix)).toEqual(["I3"]);
    expect(detailed.cards.map((i) => i.factIdPrefix)).toEqual(["M1"]);

    // The "cited ≠ true" shape the guard exists to prevent: an honest
    // "engine data unavailable" eval field beside a classification computed
    // from the sentinel's fake cp:0 — which the referee would have certified.
    const header = renderInsightHeader(asIfC4Reverted);
    expect(header).toContain("engine data unavailable");
    expect(header).toContain("inaccuracy");

    // ...and it never reaches the prompt.
    const turn = buildVerbalizerUserTurn({ contract, messageText: "analyze my game" });
    expect(turn).not.toContain(header);
    expect(turn).toContain(renderInsightHeader(good));
  });
});

describe("enforced stream refuses to ANCHOR a block to a sentinel insight", () => {
  const good = makeInsight({ factIdPrefix: "M1", topMistakeRank: 1 });
  const sentinel = makeInsight({
    factIdPrefix: "I1",
    moveNumber: 22,
    color: "b",
    playedSan: "Nf6",
    topMistakeRank: null,
    intelligenceRank: 1,
    classification: "inaccuracy",
    evalBefore: evalFact({ sentinel: true, cp: 0, depth: 0, display: "engine data unavailable" }),
  });
  const contract = makeContract([good, sentinel]);

  it("a model block headed at the sentinel ply is replaced by the honest note", async () => {
    const emitted: string[] = [];
    const stream = createEnforcedContractStream({
      contract,
      emit: (t) => emitted.push(t),
      correlationId: "sentinel-anchor",
      refereeMode: "deterministic",
      citationGranularity: "sentence",
      deadlineAtMs: Date.now() - 1, // no LLM stages
      regenSystem: { stable: "", perUser: "" },
      armingTable: { eval_display: "error" },
    });
    // The model dutifully emits the good card, then invents one for the
    // sentinel ply using its (contract-derived, fabricated) header.
    const msg =
      `${renderInsightHeader(good)}\nA fine try, but there was more [F:M1].\n[/INSIGHT]\n\n` +
      `${renderInsightHeader(sentinel)}\nThis inaccuracy cost you ground [F:I1].\n[/INSIGHT]`;
    for (let i = 0; i < msg.length; i += 13) stream.push(msg.slice(i, i + 13));
    const summary = await stream.end();
    const shipped = emitted.join("");

    expect(summary.sentinelCardsRefused).toBe(1);
    expect(summary.sentinelBlocksRefused).toBe(1);
    // Only the good card was laddered.
    expect(summary.cards.map((c) => c.factIdPrefix)).toEqual(["M1"]);
    // The block is NOT re-headed as some other card either (that would
    // mislabel prose the model wrote about a different ply).
    expect(summary.unanchoredBlocks).toBe(0);
    // The fabricated header never ships — neither the server's render of it
    // nor the model's own copy.
    expect(shipped).not.toContain(renderInsightHeader(sentinel));
    expect(shipped).not.toContain("inaccuracy");
    expect(shipped).not.toContain("This inaccuracy cost you ground");
    // ...and the omission is not silent (fail-visible, honest register).
    expect(shipped).toContain(SENTINEL_REFUSAL_NOTE.trim());
    // The good card still shipped intact.
    expect(shipped).toContain(renderInsightHeader(good));
  });

  it("summary reports 0 refusals on a sentinel-free contract", async () => {
    const clean = makeContract([good]);
    const stream = createEnforcedContractStream({
      contract: clean,
      emit: () => {},
      correlationId: "clean",
      refereeMode: "deterministic",
      citationGranularity: "sentence",
      deadlineAtMs: Date.now() + 60_000,
      regenSystem: { stable: "", perUser: "" },
    });
    stream.push(`${renderInsightHeader(good)}\nNice work [F:M1].\n[/INSIGHT]`);
    const summary = await stream.end();
    expect(summary.sentinelCardsRefused).toBe(0);
  });
});

describe("partitionSentinelCards is monotone", () => {
  it("preserves order and never adds", () => {
    const a = makeInsight({ factIdPrefix: "M1" });
    const b = makeInsight({
      factIdPrefix: "I1",
      evalAfter: evalFact({ sentinel: true, display: "engine data unavailable" }),
    });
    const c = makeInsight({ factIdPrefix: "M2" });
    const p = partitionSentinelCards([a, b, c]);
    expect(p.cards).toEqual([a, c]);
    expect(p.droppedSentinel).toEqual([b]);
    expect(p.cards.length + p.droppedSentinel.length).toBe(3);
  });
});

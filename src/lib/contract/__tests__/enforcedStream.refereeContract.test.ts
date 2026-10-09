/**
 * The enforced stream's referee contract (pathway 4.8a,
 * COACH_TURN1_EARLY_STREAM).
 *
 * With the flag on, the prompt's contract can lack a grounding result that
 * landed after the prompt was built. `refereeContract` carries the contract
 * with it, and each card's ladder and the zero-card overview are refereed
 * against it, while the header and the card plan stay the prompt's. The
 * prefix still streams at once, no card goes out before the referee's
 * contract is in hand, and a promise of the very same contract changes no
 * byte. A late Lc0 reading licenses the figure it backs. A rejected promise
 * falls back to the prompt's contract. Hermetic: deterministic referee, the
 * serving arming table, no network.
 */
import { describe, expect, it, vi } from "vitest";
import { createEnforcedContractStream } from "@/lib/contract/enforcedStream";
import type { EnforcedStreamOpts } from "@/lib/contract/enforcedStream";
import { DEFAULT_ARMING_TABLE } from "@/lib/contract/armingConfig";
import { renderInsightHeader } from "@/lib/contract/insightGrammar";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import { evalFact, makeContract, makeInsight } from "./insightFactory";

const { mockLog } = vi.hoisted(() => ({
  mockLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/logging", () => ({
  logger: { child: () => mockLog },
}));

const insight = makeInsight(); // M1, move 11 w, Bd3, Lc0 unconfigured
const LC0_OK: InsightContract["lc0"] = {
  status: "ok",
  value: { evalCp: 437, agreesWithSf: false },
  provenance: { source: "lc0", confidence: "engine_verified" },
};
/** The same insight once a late Lc0 reading of +4.37 has landed. */
const lateInsight: InsightContract = { ...insight, lc0: LC0_OK };
const promptContract = makeContract([insight]);
const lateContract = makeContract([lateInsight]);

const header = renderInsightHeader(insight);
const BODY = [
  "[WHY]",
  "Idea: Solid effort, but Ne6 was the move [F:M1].",
  "Problem: After Ne6 Qd7 Nxg7 White nets the advantage at +3.20 [F:M1.pv0].",
  "Lc0 reads +4.37 here [F:M1.lc0].",
  "[/WHY]",
].join("\n");
const PREFIX = "Let's walk through the key moment [F:M1].\n\n";
const REVIEW = `${PREFIX}${header}\n${BODY}\n[/INSIGHT]\n\nThat's the game.`;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeStream(
  contract: CoachContract,
  over: Partial<EnforcedStreamOpts> = {}
) {
  const emitted: string[] = [];
  const stream = createEnforcedContractStream({
    contract,
    emit: (t) => emitted.push(t),
    correlationId: "referee-contract",
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    regenSystem: { stable: "SYS", perUser: "USER" },
    armingTable: DEFAULT_ARMING_TABLE,
    ...over,
  });
  return { stream, emitted };
}

function feed(stream: { push(d: string): void }, text: string, chunk = 17) {
  for (let i = 0; i < text.length; i += chunk) {
    stream.push(text.slice(i, i + chunk));
  }
}

/** Lets every queued microtask and the chain's tasks run. */
const settle = () => new Promise<void>((r) => setTimeout(r, 20));

async function run(
  contract: CoachContract,
  text: string,
  over: Partial<EnforcedStreamOpts> = {}
) {
  const s = makeStream(contract, over);
  feed(s.stream, text);
  const summary = await s.stream.end();
  return { ...s, summary };
}

function summaryLog(): Record<string, unknown> | undefined {
  const calls = mockLog.info.mock.calls.filter(
    (c) => c[0] === "contract_enforce_summary"
  );
  return calls[calls.length - 1]?.[1] as Record<string, unknown> | undefined;
}

describe("the same contract behind a deferred", () => {
  it("forwards the prefix at once, holds the card until it lands, and changes no byte", async () => {
    const plain = await run(promptContract, REVIEW);

    const gate = deferred<CoachContract>();
    const s = makeStream(promptContract, { refereeContract: gate.promise });
    feed(s.stream, REVIEW);
    await settle();
    const beforeLanding = s.emitted.join("");
    expect(beforeLanding).toContain("Let's walk through the key moment");
    expect(beforeLanding).not.toContain("[INSIGHT:");

    gate.resolve(promptContract);
    const summary = await s.stream.end();
    expect(summary.finalText).toBe(plain.summary.finalText);
    expect(s.emitted.join("")).toBe(plain.emitted.join(""));
    expect(summary.cards.map((c) => c.stage)).toEqual(
      plain.summary.cards.map((c) => c.stage)
    );
    expect(summaryLog()).toHaveProperty("refereeWaitMs");
  });

  it("without the option nothing is awaited and the summary log has no wait", async () => {
    await run(promptContract, REVIEW);
    expect(summaryLog()).not.toHaveProperty("refereeWaitMs");
  });
});

describe("a late licence", () => {
  it("a figure only the late Lc0 reading backs is kept against the referee's contract and dropped without it", async () => {
    const without = await run(promptContract, REVIEW);
    const card0 = without.summary.cards[0];
    expect(card0.stage).toBe("sentence_drop");
    expect(without.summary.finalText).not.toContain("+4.37");

    const withLate = await run(promptContract, REVIEW, {
      refereeContract: Promise.resolve(lateContract),
    });
    const card1 = withLate.summary.cards[0];
    expect(card1.stage).toBe("pass");
    expect(withLate.summary.finalText).toContain("Lc0 reads +4.37 here.");

    // The header is the prompt contract's either way, byte for byte.
    const headerOf = (t: string) => t.match(/\[INSIGHT:[^\]]*\]/)?.[0];
    expect(headerOf(withLate.summary.finalText)).toBe(header);
    expect(headerOf(without.summary.finalText)).toBe(header);
  });

  it("a rejected promise falls back to the prompt's contract", async () => {
    const without = await run(promptContract, REVIEW);
    const rejected = await run(promptContract, REVIEW, {
      refereeContract: Promise.reject(new Error("late build failed")),
    });
    expect(rejected.summary.finalText).toBe(without.summary.finalText);
    expect(rejected.summary.cards[0].stage).toBe("sentence_drop");
  });
});

describe("the zero-card overview", () => {
  // Sentinel-bearing, so the prompt's card plan refuses it and the review
  // has no cards: the whole answer is overview prose.
  const sentinelInsight = makeInsight({
    evalBefore: evalFact({
      cp: 0,
      depth: 0,
      sentinel: true,
      display: "engine data unavailable",
    }),
  });
  const zeroPrompt = makeContract([sentinelInsight]);
  const zeroLate = makeContract([{ ...sentinelInsight, lc0: LC0_OK }]);
  const OVERVIEW =
    "Nice, steady game with no real wobbles anywhere in it. " +
    "Lc0 had this one at +4.37 for you. " +
    "Keep playing at this length and the reviews get richer.";

  it("is refereed against the referee's contract", async () => {
    const without = await run(zeroPrompt, OVERVIEW);
    expect(without.summary.cards).toEqual([]);
    expect(without.summary.overviewOutcome).toBe("sentence_drop");
    expect(without.summary.finalText).not.toContain("+4.37");

    const withLate = await run(zeroPrompt, OVERVIEW, {
      refereeContract: Promise.resolve(zeroLate),
    });
    expect(withLate.summary.cards).toEqual([]);
    expect(withLate.summary.overviewOutcome).toBe("pass");
    expect(withLate.summary.finalText).toContain("+4.37");
  });
});

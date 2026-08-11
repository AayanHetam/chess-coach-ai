/**
 * PR-CI-4 ROLLBACK DRILL (plan §7 CI-4 gate, executed as a test):
 * CONTRACT_CATEGORIES="" ⇒ byte-identical legacy serving. Reuses the SSE
 * byte-identity methodology from shadowReferee.test.ts: a harness that
 * mirrors the route's branch decision + emission loop exactly, byte-compared
 * across env flips.
 *
 * The drill is the plan's rollback story made mechanical: emptying the
 * category list must reproduce the legacy transcript to the byte, and
 * arming a category must (sanity, non-vacuous) change serving.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { __resetContractEnvCacheForTests, getContractEnv } from "@/env";
import { createEnforcedContractStream } from "@/lib/contract/enforcedStream";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import type { CoachContract } from "@/lib/contract/types";
import { makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: { child: () => ({ info: () => {}, warn: () => {}, error: () => {} }) },
}));

beforeEach(() => {
  __resetContractEnvCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetContractEnvCacheForTests();
});

/**
 * Mirrors route.ts: the contract branch is entered ONLY when a contract
 * exists AND the classified category is listed (route.ts flag-on wing).
 */
function contractBranchArmed(contract: CoachContract | null, category: string): boolean {
  return !!contract && getContractEnv().categories.includes(category);
}

/** Route-shaped SSE emission — the LEGACY loop, byte for byte. */
function legacySse(deltas: string[]): Buffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const send = (obj: unknown) => {
    chunks.push(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };
  for (const delta of deltas) send({ type: "text", delta });
  send({ type: "done", metadata: { analysis: deltas.join("") } });
  return Buffer.concat(chunks);
}

/** The route decision + emission, as wired in PR-CI-4. `armingTable` mirrors
 * the serving override seam (contractServing.ts) — omitted, the precision-
 * pack all-warn default applies. */
async function serveStreaming(
  deltas: string[],
  category: string,
  contract: CoachContract,
  armingTable?: import("@/lib/contract/armingConfig").ArmingTable,
): Promise<Buffer> {
  if (!contractBranchArmed(contract, category)) {
    return legacySse(deltas); // legacy branches — untouched
  }
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const send = (obj: unknown) => {
    chunks.push(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };
  const stream = createEnforcedContractStream({
    contract,
    emit: (delta) => send({ type: "text", delta }),
    correlationId: "drill",
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    regenSystem: { stable: "SYS", perUser: "USER" },
    armingTable,
  });
  for (const d of deltas) stream.push(d);
  const summary = await stream.end();
  send({ type: "done", metadata: { analysis: summary.finalText } });
  return Buffer.concat(chunks);
}

function fixtureDeltas(): { deltas: string[]; contract: CoachContract } {
  const a = makeInsight();
  const b = makeInsight({ moveNumber: 14, color: "b", factIdPrefix: "M2", topMistakeRank: 2 });
  const contract = makeContract([a, b]);
  const message =
    "Let's walk through the key moments.\n\n" +
    renderInsightBlock(a, "You missed a forced mate in 3 — the eval crashed to +9.00.") +
    "\n\n" +
    renderInsightBlock(b, "Steady move.");
  const deltas: string[] = [];
  for (let i = 0; i < message.length; i += 13) deltas.push(message.slice(i, i + 13));
  return { deltas, contract };
}

describe("rollback drill: CONTRACT_CATEGORIES empty ⇒ byte-identical legacy serving", () => {
  it("unset (the shipping default) — bytes identical to pure legacy on both categories", async () => {
    const { deltas, contract } = fixtureDeltas();
    const legacy = legacySse(deltas);
    expect(getContractEnv().categories).toEqual([]);
    for (const category of ["position_analysis", "game_review"]) {
      const served = await serveStreaming(deltas, category, contract);
      expect(served.equals(legacy)).toBe(true);
    }
  });

  it('explicit CONTRACT_CATEGORIES="" (the rollback flip) — bytes identical to pure legacy', async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "");
    __resetContractEnvCacheForTests();
    const { deltas, contract } = fixtureDeltas();
    const served = await serveStreaming(deltas, "position_analysis", contract);
    expect(served.equals(legacySse(deltas))).toBe(true);
  });

  it("armed category list scopes enforcement to LISTED categories only", async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "position_analysis");
    __resetContractEnvCacheForTests();
    const { contract } = fixtureDeltas();
    expect(contractBranchArmed(contract, "position_analysis")).toBe(true);
    expect(contractBranchArmed(contract, "game_review")).toBe(false);
    expect(contractBranchArmed(null, "position_analysis")).toBe(false);
  });

  it("trim/case-hardened parsing (the Vercel trailing-\\n save hazard)", async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", " Position_Analysis ,\n");
    __resetContractEnvCacheForTests();
    expect(getContractEnv().categories).toEqual(["position_analysis"]);
  });

  it("sanity (non-vacuous drill): an ENFORCEMENT-armed path actually changes serving", async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "position_analysis");
    __resetContractEnvCacheForTests();
    const { deltas, contract } = fixtureDeltas();
    const legacy = legacySse(deltas);
    // Precision-pack correction: the DEFAULT table is all-warn (30-game FP
    // adjudication — nothing arms at error before the re-measure), so the
    // drill arms explicitly via the serving override seam, exactly as a
    // post-re-measure config would.
    const armed = await serveStreaming(deltas, "position_analysis", contract, {
      eval_display: "error",
      san_whitelist: "error",
      tactical_keyword: "error",
      forbidden_claim: "error",
      citation_invalid: "error",
    });
    // The fabricated mate/eval card gets refereed — bytes MUST differ.
    expect(armed.equals(legacy)).toBe(false);
    expect(armed.toString()).not.toContain("mate in 3");
  });

  it("v3-armed default: a fabricated claim is suppressed on the contract branch", async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "position_analysis");
    __resetContractEnvCacheForTests();
    const { deltas, contract } = fixtureDeltas();
    const served = await serveStreaming(deltas, "position_analysis", contract);
    // Since the 2026-08-11 arming (v3 measurement: 0 measured false positives
    // on the armed checks), the fabricated mate claim in this fixture no
    // longer reaches the client — this assertion IS the enforcement proof.
    // The rollback guarantee is unaffected and is asserted by the
    // flag-off/empty-list cases above: no category armed ⇒ byte-identical.
    expect(served.toString()).not.toContain("mate in 3");
    expect(served.toString()).toContain("Let's walk th");
  });
});

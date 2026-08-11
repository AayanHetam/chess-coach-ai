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
import { isContractServingArmed } from "@/lib/contract/servingGate";
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

/** The CI-5 dogfood uid — an arbitrary stand-in for the founder's session uid. */
const DOGFOOD_UID = "AayanUid123";
const OTHER_UID = "someoneElseUid";

/**
 * Mirrors route.ts: the contract branch is entered ONLY when a contract
 * exists AND the serving gate arms the request — the classified category is
 * listed (everyone) or the session uid is listed (that user, every category).
 */
function contractBranchArmed(
  contract: CoachContract | null,
  category: string,
  uid: string | null = null,
): boolean {
  return !!contract && isContractServingArmed({ category, uid });
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
  uid: string | null = null,
): Promise<Buffer> {
  if (!contractBranchArmed(contract, category, uid)) {
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

// ───────────────────────────────────────────────────────────────────────────
// PR-CI-5: the same drill for game_review + the CONTRACT_UIDS dogfood lever.
//
// game_review is the highest-traffic surface and the exact path the 24.6/100
// fabrication baseline was measured on, so its rollback story has to be
// mechanically proven, not argued: with neither the category nor the uid
// armed, serving must be legacy to the BYTE.
// ───────────────────────────────────────────────────────────────────────────
describe("rollback drill: game_review", () => {
  it("committed default (CONTRACT_CATEGORIES=position_analysis, no uids) ⇒ game_review is byte-identical legacy", async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "position_analysis");
    __resetContractEnvCacheForTests();
    const { deltas, contract } = fixtureDeltas();
    const legacy = legacySse(deltas);
    const served = await serveStreaming(deltas, "game_review", contract, undefined, DOGFOOD_UID);
    expect(served.equals(legacy)).toBe(true);
    // ...and the position_analysis path is still armed (non-vacuous).
    expect(contractBranchArmed(contract, "position_analysis", DOGFOOD_UID)).toBe(true);
  });

  it("CONTRACT_UIDS arms game_review for the LISTED uid only", async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "position_analysis");
    vi.stubEnv("CONTRACT_UIDS", DOGFOOD_UID);
    __resetContractEnvCacheForTests();
    const { deltas, contract } = fixtureDeltas();
    const legacy = legacySse(deltas);

    // The dogfood uid gets enforced serving on game_review...
    const dogfood = await serveStreaming(
      deltas,
      "game_review",
      contract,
      { eval_display: "error" },
      DOGFOOD_UID,
    );
    expect(dogfood.equals(legacy)).toBe(false);
    expect(dogfood.toString()).not.toContain("mate in 3");

    // ...and EVERY other user still gets byte-identical legacy.
    const everyoneElse = await serveStreaming(
      deltas,
      "game_review",
      contract,
      { eval_display: "error" },
      OTHER_UID,
    );
    expect(everyoneElse.equals(legacy)).toBe(true);
    const anonymous = await serveStreaming(
      deltas,
      "game_review",
      contract,
      { eval_display: "error" },
      null,
    );
    expect(anonymous.equals(legacy)).toBe(true);
  });

  it("emptying CONTRACT_UIDS is the CI-5 rollback — game_review returns to byte-identical legacy", async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "position_analysis");
    vi.stubEnv("CONTRACT_UIDS", "");
    __resetContractEnvCacheForTests();
    const { deltas, contract } = fixtureDeltas();
    expect(getContractEnv().uids).toEqual([]);
    const served = await serveStreaming(
      deltas,
      "game_review",
      contract,
      { eval_display: "error" },
      DOGFOOD_UID,
    );
    expect(served.equals(legacySse(deltas))).toBe(true);
  });

  it("uid arming survives the Vercel trailing-\\n save and stays case-EXACT", async () => {
    vi.stubEnv("CONTRACT_UIDS", ` ${DOGFOOD_UID} ,\n`);
    __resetContractEnvCacheForTests();
    expect(getContractEnv().uids).toEqual([DOGFOOD_UID]);
    const { contract } = fixtureDeltas();
    expect(contractBranchArmed(contract, "game_review", DOGFOOD_UID)).toBe(true);
    // A different-case uid is a DIFFERENT user and must not be armed.
    expect(contractBranchArmed(contract, "game_review", DOGFOOD_UID.toLowerCase())).toBe(false);
  });

  it("general rollout: CONTRACT_CATEGORIES=game_review arms every uid, and emptying it rolls back", async () => {
    const { deltas, contract } = fixtureDeltas();
    const legacy = legacySse(deltas);

    vi.stubEnv("CONTRACT_CATEGORIES", "position_analysis,game_review");
    __resetContractEnvCacheForTests();
    for (const uid of [DOGFOOD_UID, OTHER_UID, null]) {
      expect(contractBranchArmed(contract, "game_review", uid)).toBe(true);
    }

    vi.stubEnv("CONTRACT_CATEGORIES", "position_analysis");
    __resetContractEnvCacheForTests();
    for (const uid of [DOGFOOD_UID, OTHER_UID, null]) {
      const served = await serveStreaming(deltas, "game_review", contract, undefined, uid);
      expect(served.equals(legacy)).toBe(true);
    }
  });
});

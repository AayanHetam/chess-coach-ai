/**
 * The rollback drill with turn-1 moments (pathway 4.1).
 *
 * contractRollbackDrill.test.ts's harness, with the route's moment frame:
 * COACH_TURN1_MOMENTS on and nothing armed is legacy to the byte, and on an
 * armed path the flag adds `moment` frames and nothing else, so removing
 * them gives the flag-off bytes exactly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { __resetContractEnvCacheForTests } from "@/env";
import { isContractServingArmed } from "@/lib/contract/servingGate";
import { createEnforcedContractStream } from "@/lib/contract/enforcedStream";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import { isTurnMomentsEnabled } from "@/lib/contract/turnMoments";
import { TURN_MOMENT_EVENT } from "@/lib/coach/turnMoment";
import type { CoachContract } from "@/lib/contract/types";
import { makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
  },
}));

beforeEach(() => {
  __resetContractEnvCacheForTests();
});
afterEach(() => {
  vi.unstubAllEnvs();
  __resetContractEnvCacheForTests();
});

/** Route-shaped SSE emission: the LEGACY loop, byte for byte. */
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

/** The route's decision and emission, with the moment frame as route.ts sends it. */
async function serveStreaming(
  deltas: string[],
  category: string,
  contract: CoachContract
): Promise<Buffer> {
  if (!(contract && isContractServingArmed({ category, uid: null }))) {
    return legacySse(deltas);
  }
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const send = (obj: unknown) => {
    chunks.push(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };
  const turnMoments = isTurnMomentsEnabled();
  const stream = createEnforcedContractStream({
    contract,
    emit: (delta) => send({ type: "text", delta }),
    emitMoment: turnMoments
      ? (moment) => send({ type: TURN_MOMENT_EVENT, moment })
      : undefined,
    correlationId: "drill",
    refereeMode: "deterministic",
    citationGranularity: "sentence",
    deadlineAtMs: Date.now() + 60_000,
    regenSystem: { stable: "SYS", perUser: "USER" },
  });
  for (const d of deltas) stream.push(d);
  const summary = await stream.end();
  send({ type: "done", metadata: { analysis: summary.finalText } });
  return Buffer.concat(chunks);
}

/** One card that passes and lifts, one fabricated card the ladder templates. */
function fixtureDeltas(): { deltas: string[]; contract: CoachContract } {
  const a = makeInsight();
  const b = makeInsight({
    moveNumber: 14,
    color: "b",
    factIdPrefix: "M2",
    topMistakeRank: 2,
  });
  const contract = makeContract([a, b]);
  const message =
    "Let's walk through the key moments.\n\n" +
    renderInsightBlock(
      a,
      "[WHY]\nIdea: Solid effort, but Ne6 was the move [F:M1].\nProblem: After Ne6 Qd7 Nxg7 White nets the advantage at +3.20 [F:M1.pv0].\n[/WHY]"
    ) +
    "\n\n" +
    renderInsightBlock(
      b,
      "You missed a forced mate in 3, and the eval crashed to +9.00."
    );
  const deltas: string[] = [];
  for (let i = 0; i < message.length; i += 13)
    deltas.push(message.slice(i, i + 13));
  return { deltas, contract };
}

/** The SSE frames of a buffer, with the moment frames taken out. */
function withoutMoments(buf: Buffer): { bytes: Buffer; moments: number } {
  const frames = buf
    .toString("utf8")
    .split("\n\n")
    .filter((f) => f.length > 0);
  const kept = frames.filter(
    (f) => JSON.parse(f.slice("data: ".length)).type !== TURN_MOMENT_EVENT
  );
  return {
    bytes: Buffer.from(kept.map((f) => `${f}\n\n`).join(""), "utf8"),
    moments: frames.length - kept.length,
  };
}

describe("rollback drill with COACH_TURN1_MOMENTS", () => {
  it("flag on with nothing armed is legacy to the byte, on both categories", async () => {
    vi.stubEnv("COACH_TURN1_MOMENTS", "1");
    vi.stubEnv("CONTRACT_CATEGORIES", "");
    __resetContractEnvCacheForTests();
    const { deltas, contract } = fixtureDeltas();
    for (const category of ["position_analysis", "game_review"]) {
      const served = await serveStreaming(deltas, category, contract);
      expect(served.equals(legacySse(deltas))).toBe(true);
    }
  });

  it("flag on and armed: the moment frames removed, the bytes are the flag-off armed bytes", async () => {
    vi.stubEnv("CONTRACT_CATEGORIES", "game_review");
    __resetContractEnvCacheForTests();
    const { deltas, contract } = fixtureDeltas();

    vi.stubEnv("COACH_TURN1_MOMENTS", "0");
    const off = await serveStreaming(deltas, "game_review", contract);
    vi.stubEnv("COACH_TURN1_MOMENTS", "1");
    const on = await serveStreaming(deltas, "game_review", contract);

    // Non-vacuous: the armed path is not legacy, and the flag did add frames.
    expect(off.equals(legacySse(deltas))).toBe(false);
    expect(off.toString()).not.toContain("mate in 3");
    const stripped = withoutMoments(on);
    expect(stripped.moments).toBe(1);
    expect(withoutMoments(off).moments).toBe(0);
    expect(stripped.bytes.equals(off)).toBe(true);
  });
});

/**
 * PR-CI-3 gate: SSE transcript BYTE-IDENTITY, flag gating, and the bounded
 * fire-and-forget relational parses.
 *
 * The harness below replicates the route's streaming emission loop exactly
 * (route.ts stream branches): `send({type:"text",delta})` per delta, then
 * `gate?.push(delta)`, then `gate?.end()` before the done event. The gate is
 * created through the REAL flag path (maybeCreateShadowRefereeGate reading
 * CONTRACT_REFEREE_SHADOW via getContractEnv) — so this test proves the
 * plan-§7 CI-3 gate: client-visible bytes with the flag ON are identical to
 * the flag-OFF bytes, while the referee demonstrably ran (log capture).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { __resetContractEnvCacheForTests } from "@/env";
import { maybeCreateShadowRefereeGate } from "@/lib/contract/shadowReferee";
import type { ShadowRefereeGate } from "@/lib/contract/shadowReferee";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import { makeContract, makeInsight } from "./insightFactory";

// Capture every structured log line the shadow referee emits.
const logCapture = vi.hoisted(() => ({
  lines: [] as Array<{ level: string; msg: string; data: unknown }>,
}));
vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({
      info: (msg: string, data?: unknown) =>
        logCapture.lines.push({ level: "info", msg, data }),
      warn: (msg: string, data?: unknown) =>
        logCapture.lines.push({ level: "warn", msg, data }),
      error: (msg: string, data?: unknown) =>
        logCapture.lines.push({ level: "error", msg, data }),
    }),
  },
}));

const realFetch = global.fetch;

beforeEach(() => {
  logCapture.lines.length = 0;
  __resetContractEnvCacheForTests();
  // Hermetic: the fire-and-forget relational parse must never leave the
  // process even when a developer's shell exports a real API key.
  global.fetch = vi.fn(async () => {
    throw new Error("network disabled in shadowReferee.test");
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
  vi.unstubAllEnvs();
  __resetContractEnvCacheForTests();
});

/** Route-shaped SSE emission (mirrors route.ts streaming loops byte for byte). */
function streamSse(deltas: string[], gate: ShadowRefereeGate | null): Buffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const send = (obj: unknown) => {
    chunks.push(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
  };
  for (const delta of deltas) {
    send({ type: "text", delta });
    gate?.push(delta);
  }
  gate?.end();
  send({ type: "done", metadata: { analysis: deltas.join("") } });
  return Buffer.concat(chunks);
}

/** Canned model output: prefix + 2 blocks matching the contract, chunked. */
function cannedDeltas(): { deltas: string[]; contract: ReturnType<typeof makeContract> } {
  const a = makeInsight();
  const b = makeInsight({ moveNumber: 14, color: "b", playedSan: "g5", factIdPrefix: "M2" });
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

describe("flag gating (CONTRACT_REFEREE_SHADOW)", () => {
  it("flag off (default) ⇒ no gate at all, even with a contract", () => {
    const { contract } = cannedDeltas();
    expect(
      maybeCreateShadowRefereeGate({ contract, correlationId: "t", branch: "stream-flagoff" }),
    ).toBeNull();
  });

  it("trim-hardened: 'true\\n' (the Vercel save hazard) enables the gate", () => {
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true\n");
    __resetContractEnvCacheForTests();
    const { contract } = cannedDeltas();
    expect(
      maybeCreateShadowRefereeGate({ contract, correlationId: "t", branch: "stream-flagoff" }),
    ).not.toBeNull();
  });

  it("flag on but no contract (position-only request) ⇒ no gate", () => {
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true");
    __resetContractEnvCacheForTests();
    expect(
      maybeCreateShadowRefereeGate({ contract: null, correlationId: "t", branch: "stream-flagoff" }),
    ).toBeNull();
  });
});

describe("SSE transcript byte-identity (CI-3 gate: flag on ≡ flag off)", () => {
  it("client-visible bytes are IDENTICAL with the shadow referee on, and the referee ran", async () => {
    const { deltas, contract } = cannedDeltas();

    // Flag OFF — the exact serving default.
    const gateOff = maybeCreateShadowRefereeGate({
      contract,
      correlationId: "t-off",
      branch: "stream-flagoff",
    });
    expect(gateOff).toBeNull();
    const bytesOff = streamSse(deltas, gateOff);

    // Flag ON.
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true");
    __resetContractEnvCacheForTests();
    const gateOn = maybeCreateShadowRefereeGate({
      contract,
      correlationId: "t-on",
      branch: "stream-flagoff",
    });
    expect(gateOn).not.toBeNull();
    const bytesOn = streamSse(deltas, gateOn);

    // THE gate: byte-for-byte identical client-visible output.
    expect(bytesOn.equals(bytesOff)).toBe(true);

    // …while the referee demonstrably ran, log-only:
    const blockLogs = logCapture.lines.filter((l) => l.msg === "contract_referee_shadow_block");
    expect(blockLogs).toHaveLength(2);
    const first = blockLogs[0].data as { factIdPrefix: string; errorCount: number };
    expect(first.factIdPrefix).toBe("M1");
    expect(first.errorCount).toBeGreaterThanOrEqual(2); // fake mate + fake eval
    const summary = logCapture.lines.find((l) => l.msg === "contract_referee_shadow_summary");
    expect(summary).toBeDefined();
    expect(summary!.data).toMatchObject({ blocksSeen: 2, matched: 2, unmatched: 0 });

    // Fire-and-forget relational parses settle without touching the network
    // (fetch is stubbed to throw; validateRelationalClaim fails OPEN on a
    // parser error — pass-through result, zero contradictions) and never
    // affect the transcript. Both blocks launched a parse; both resolved.
    await new Promise((r) => setTimeout(r, 10));
    const relResolved = logCapture.lines.filter(
      (l) => l.msg === "contract_referee_shadow_relational",
    );
    expect(relResolved).toHaveLength(2);
    expect(relResolved.every((l) => (l.data as { contradictions: number }).contradictions === 0)).toBe(
      true,
    );
  });
});

describe("bounded Haiku parses + unclosed-block telemetry", () => {
  it("caps relational launches at MAX_RELATIONAL_PARSES_PER_REVIEW (8) across 10 blocks", () => {
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true");
    __resetContractEnvCacheForTests();
    const insights = Array.from({ length: 10 }, (_, i) =>
      makeInsight({ moveNumber: 11 + i, factIdPrefix: `M${i + 1}` }),
    );
    const contract = makeContract(insights);
    const message = insights.map((ins) => renderInsightBlock(ins, "A card.")).join("\n");
    const gate = maybeCreateShadowRefereeGate({
      contract,
      correlationId: "t-bound",
      branch: "stream-flagoff",
    })!;
    streamSse([message], gate);
    const summary = logCapture.lines.find((l) => l.msg === "contract_referee_shadow_summary");
    expect(summary!.data).toMatchObject({ blocksSeen: 10, matched: 10, relationalLaunched: 8 });
  });

  it("logs unclosed trailing blocks (max_tokens truncation) at stream end", () => {
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true");
    __resetContractEnvCacheForTests();
    const insight = makeInsight();
    const contract = makeContract([insight]);
    const gate = maybeCreateShadowRefereeGate({
      contract,
      correlationId: "t-unclosed",
      branch: "stream-flagoff",
    })!;
    streamSse(["[INSIGHT:11:w:blunder:+1.38:-2.12:Bd3:Ne6]\ncut off mid-"], gate);
    const unclosed = logCapture.lines.find(
      (l) => l.msg === "contract_referee_shadow_unclosed_block",
    );
    expect(unclosed).toBeDefined();
    expect(unclosed!.data).toMatchObject({
      headerRaw: "11:w:blunder:+1.38:-2.12:Bd3:Ne6",
    });
  });
});

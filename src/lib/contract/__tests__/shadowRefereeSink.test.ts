/**
 * CI-5 gate: the onReview persistence sink observes the review WITHOUT
 * changing a single client-visible byte, and cannot break the stream.
 *
 * The harness is the same route-shaped SSE emitter shadowReferee.test.ts
 * uses (send(delta) then gate.push(delta), then gate.end() before done) —
 * the CI-3 byte-identity gate has to keep holding with a sink attached,
 * because this PR is telemetry only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { __resetContractEnvCacheForTests } from "@/env";
import {
  maybeCreateShadowRefereeGate,
  sentenceContaining,
} from "@/lib/contract/shadowReferee";
import type { ShadowRefereeGate, ShadowRefereeReview } from "@/lib/contract/shadowReferee";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import { makeContract, makeInsight } from "./insightFactory";

const logCapture = vi.hoisted(() => ({
  lines: [] as Array<{ level: string; msg: string; data: unknown }>,
}));
vi.mock("@/lib/logging", () => ({
  logger: {
    child: () => ({
      info: (msg: string, data?: unknown) => logCapture.lines.push({ level: "info", msg, data }),
      warn: (msg: string, data?: unknown) => logCapture.lines.push({ level: "warn", msg, data }),
      error: (msg: string, data?: unknown) => logCapture.lines.push({ level: "error", msg, data }),
    }),
  },
}));

const realFetch = global.fetch;

beforeEach(() => {
  logCapture.lines.length = 0;
  __resetContractEnvCacheForTests();
  // Hermetic: the fire-and-forget relational parse must never leave the process.
  global.fetch = vi.fn(async () => {
    throw new Error("network disabled in shadowRefereeSink.test");
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = realFetch;
  vi.unstubAllEnvs();
  __resetContractEnvCacheForTests();
});

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

/** Two blocks; the first carries a fabricated mate + eval, the second is clean. */
function cannedDeltas() {
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

describe("onReview sink: byte-identity is preserved", () => {
  it("bytes with a sink attached are IDENTICAL to flag-off bytes, and the sink fired", () => {
    const { deltas, contract } = cannedDeltas();

    const gateOff = maybeCreateShadowRefereeGate({
      contract,
      correlationId: "t-off",
      branch: "stream-flagoff",
    });
    expect(gateOff).toBeNull();
    const bytesOff = streamSse(deltas, gateOff);

    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true");
    __resetContractEnvCacheForTests();
    const reviews: ShadowRefereeReview[] = [];
    const gateOn = maybeCreateShadowRefereeGate({
      contract,
      correlationId: "t-on",
      branch: "stream-flagoff",
      onReview: (r) => reviews.push(r),
    })!;
    const bytesOn = streamSse(deltas, gateOn);

    expect(bytesOn.equals(bytesOff)).toBe(true);
    expect(reviews).toHaveLength(1);
  });

  it("a THROWING sink cannot break the stream or the bytes", () => {
    const { deltas, contract } = cannedDeltas();
    const bytesOff = streamSse(deltas, null);

    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true");
    __resetContractEnvCacheForTests();
    const gate = maybeCreateShadowRefereeGate({
      contract,
      correlationId: "t-throw",
      branch: "stream-flagoff",
      onReview: () => {
        throw new Error("sink exploded");
      },
    })!;
    expect(() => streamSse(deltas, gate)).not.toThrow();
    expect(streamSse(deltas, null).equals(bytesOff)).toBe(true);
    expect(
      logCapture.lines.some((l) => l.msg === "contract_referee_shadow_sink_failed"),
    ).toBe(true);
  });
});

describe("onReview sink: payload", () => {
  function runWithSink(): ShadowRefereeReview {
    vi.stubEnv("CONTRACT_REFEREE_SHADOW", "true");
    __resetContractEnvCacheForTests();
    const { deltas, contract } = cannedDeltas();
    const reviews: ShadowRefereeReview[] = [];
    const gate = maybeCreateShadowRefereeGate({
      contract,
      correlationId: "t-payload",
      branch: "stream-flagon-fallback",
      onReview: (r) => reviews.push(r),
    })!;
    streamSse(deltas, gate);
    return reviews[0];
  }

  it("carries the same block accounting as the summary log line", () => {
    const review = runWithSink();
    const summary = logCapture.lines.find((l) => l.msg === "contract_referee_shadow_summary")!
      .data as Record<string, unknown>;
    expect(review).toMatchObject({
      contractId: summary.contractId as string,
      correlationId: "t-payload",
      branch: "stream-flagon-fallback",
      blocksSeen: summary.blocksSeen as number,
      matched: summary.matched as number,
      unmatched: summary.unmatched as number,
      malformedHeaders: summary.malformedHeaders as number,
      refereeErrors: summary.totalErrors as number,
      refereeWarns: summary.totalWarns as number,
      p95HoldMs: summary.p95HoldMs as number,
      maxHoldMs: summary.maxHoldMs as number,
      relationalLaunched: summary.relationalLaunched as number,
    });
  });

  it("counts fires per check and per category, totalling the span list", () => {
    const review = runWithSink();
    const perCheck = Object.values(review.checkCounts).reduce((a, b) => a + b, 0);
    const perCategory = Object.values(review.categoryCounts).reduce((a, b) => a + b, 0);
    expect(perCheck).toBeGreaterThan(0);
    expect(perCheck).toBe(perCategory);
    // The canned prose fabricates a mate and an eval, so both fired.
    expect(perCheck).toBe(review.refereeErrors + review.refereeWarns);
    expect(review.spans).toHaveLength(perCheck);
  });

  it("armed counts reflect the CURRENT arming table, not the referee's severity", () => {
    const review = runWithSink();
    // Every finding lands in exactly one of armed error/warn/off.
    expect(review.armedErrors + review.armedWarns).toBeLessThanOrEqual(
      review.refereeErrors + review.refereeWarns,
    );
    for (const s of review.spans) {
      expect(["error", "warn", "off"]).toContain(s.armed);
      // user_visibility can never arm at error (standing prohibition).
      if (s.check === "stage9_user_visibility") expect(s.armed).not.toBe("error");
    }
    expect(review.spans.filter((s) => s.armed === "error")).toHaveLength(review.armedErrors);
    expect(review.spans.filter((s) => s.armed === "warn")).toHaveLength(review.armedWarns);
  });

  it("every span carries the adjudication context: sentence, check, category, factIdPrefix", () => {
    const review = runWithSink();
    expect(review.spans.length).toBeGreaterThan(0);
    for (const s of review.spans) {
      expect(s.span.length).toBeGreaterThan(0);
      expect(s.factIdPrefix).toMatch(/^M\d+$/);
      expect(typeof s.category).toBe("string");
      expect(s.sentence).toContain(s.span);
    }
  });
});

describe("sentenceContaining", () => {
  it("returns the sentence around the span, not the whole block", () => {
    const text = "First sentence here. The knight forks the bishop on e7. Third one.";
    expect(sentenceContaining(text, "forks the bishop on e7")).toBe(
      "The knight forks the bishop on e7.",
    );
  });

  it("does not split on the decimal point of an eval display", () => {
    const text = "The eval swung to +1.38 after that.";
    expect(sentenceContaining(text, "+1.38")).toBe("The eval swung to +1.38 after that.");
  });

  it("is bounded by newlines", () => {
    const text = "Header line\nThe rook lifts to d3\nTrailing line";
    expect(sentenceContaining(text, "rook lifts")).toBe("The rook lifts to d3");
  });

  it("returns empty for an absent or empty span", () => {
    expect(sentenceContaining("abc", "zzz")).toBe("");
    expect(sentenceContaining("abc", "")).toBe("");
  });
});

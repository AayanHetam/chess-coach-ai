import { describe, it, expect } from "vitest";
import { validateMotifGrounding } from "../../mastermind/validators/motifGrounding";
import type { AnyMotif } from "../types";

const CORR = "test-corr-id";

const CONFIRMED_FORK: AnyMotif = {
  motif: "fork",
  by_piece: "n",
  by_square: "e5",
  targets: [
    { square: "d7", piece: "q" },
    { square: "f7", piece: "r" },
  ],
  unavoidable_loss_cp: 500,
  confirmed: true,
  refutation: null,
};

const UNCONFIRMED_FORK: AnyMotif = {
  ...CONFIRMED_FORK,
  confirmed: false,
  refutation: { move: "Rxe5", refuted_by: "recapture" },
};

describe("validateMotifGrounding", () => {
  it("passes when no tactical keywords in response", () => {
    const result = validateMotifGrounding({
      llmResponse: "This was a positional move that controls the center.",
      detectedMotifs: [],
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
    expect(result.issues.length).toBe(0);
  });

  it("passes when confirmed fork present and 'fork' used", () => {
    const result = validateMotifGrounding({
      llmResponse: "The knight fork wins material decisively.",
      detectedMotifs: [CONFIRMED_FORK],
      correlationId: CORR,
    });
    expect(result.passed).toBe(true);
  });

  it("fails when 'fork' used with no confirmed motifs", () => {
    const result = validateMotifGrounding({
      llmResponse: "This creates a deadly fork winning the rook.",
      detectedMotifs: [],
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.llm_span.includes("fork"))).toBe(true);
  });

  it("fails when 'pin' used with only fork motif present", () => {
    const result = validateMotifGrounding({
      llmResponse: "The bishop creates a pin on the knight.",
      detectedMotifs: [CONFIRMED_FORK],
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.llm_span.includes("pin"))).toBe(true);
  });

  it("allows unconfirmed fork if refutation is cited", () => {
    const result = validateMotifGrounding({
      llmResponse: "Looks like a fork pattern but the opponent has Rxe5 which refutes it.",
      detectedMotifs: [UNCONFIRMED_FORK],
      correlationId: CORR,
    });
    // "fork" is mentioned AND refutation move "Rxe5" is cited → should pass
    expect(result.passed).toBe(true);
  });

  it("fails when unconfirmed fork mentioned without citing refutation", () => {
    const result = validateMotifGrounding({
      llmResponse: "The knight creates a fork on d7 and f7.",
      detectedMotifs: [UNCONFIRMED_FORK],
      correlationId: CORR,
    });
    expect(result.passed).toBe(false);
  });

  it("emits telemetry event", () => {
    const result = validateMotifGrounding({
      llmResponse: "fork pin skewer",
      detectedMotifs: [],
      correlationId: CORR,
    });
    expect(result.telemetry.length).toBeGreaterThan(0);
    expect(result.telemetry[0].check_name).toBe("motif_grounding");
  });

  it("costs zero USD (no parser LLM call)", () => {
    const result = validateMotifGrounding({
      llmResponse: "some response",
      detectedMotifs: [],
      correlationId: CORR,
    });
    expect(result.costUsd).toBe(0);
  });
});

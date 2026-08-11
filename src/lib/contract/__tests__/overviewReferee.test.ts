/**
 * The ZERO-CARD review — the game_review shape that shipped RAW.
 *
 * Refereeing is per-card (`createEnforcedContractStream` intercepts only
 * `[INSIGHT] … [/INSIGHT]` bodies), so a review whose card plan is empty was
 * 100% out-of-block text and reached the client with nothing but citation
 * stripping applied — while the verbalizer prompt explicitly instructs the
 * model to free-write there. These tests pin the close: contract-global
 * checks, sentence-drop, and a deterministic floor. See overviewReferee.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { createEnforcedContractStream } from "@/lib/contract/enforcedStream";
import {
  checkOverviewGrammar,
  refereeOverview,
  renderOverviewTemplate,
} from "@/lib/contract/overviewReferee";
import { selectCardInsights } from "@/lib/prompts/verbalizerPrompt";
import type { ArmingTable } from "@/lib/contract/armingConfig";
import { makeContract, makeInsight } from "./insightFactory";

vi.mock("@/lib/logging", () => ({
  logger: { child: () => ({ info: () => {}, warn: () => {}, error: () => {} }) },
}));

const ENFORCE_TABLE: ArmingTable = { eval_display: "error" };

/** A game with no insights at all — what `selectInsights` returns for a clean
 * or very short game (fixture 06 in the vendored set). */
const emptyContract = () => makeContract([]);

describe("a zero-card review is actually a zero-card review", () => {
  it("no insights ⇒ no cards ⇒ the whole answer is out-of-block prose", () => {
    expect(selectCardInsights(emptyContract())).toEqual([]);
  });
});

describe("contract-global checks on overview prose", () => {
  it("passes prose whose every fact is in the contract", () => {
    const c = emptyContract();
    const r = refereeOverview(
      "Nice, steady game — nothing here went badly wrong. Keep building on it.",
      c,
    );
    expect(r.outcome).toBe("pass");
    expect(r.violations).toEqual([]);
  });

  it("refutes an eval figure no contract eval backs, keeping the rest", () => {
    const c = emptyContract();
    const r = refereeOverview(
      "Nice, steady game with no real wobbles anywhere in it. You held a clean +4.50 " +
        "edge the whole way through. Keep playing at this length and the reviews get richer.",
      c,
    );
    expect(r.violations.map((v) => v.category)).toContain("eval_unbacked");
    expect(r.text).not.toContain("+4.50");
    expect(r.text).toContain("Nice, steady game with no real wobbles anywhere in it.");
    expect(r.outcome).toBe("sentence_drop");
  });

  it("drops to the template when the survivors are too thin to be an answer", () => {
    // The ladder's own stage-(a) rule: a drop that leaves under 40 substantive
    // characters is not a shorter answer, it is no answer.
    const c = emptyContract();
    const r = refereeOverview("Nice game. You held +4.50 throughout. Keep it up.", c);
    expect(r.outcome).toBe("templated");
  });

  it("refutes a SAN token that occurs nowhere in the contract", () => {
    const c = emptyContract();
    const v = checkOverviewGrammar("Your Qh7 was the move that held it together.", c);
    expect(v.map((x) => x.category)).toContain("san_unknown");
  });

  it("refutes tactical vocabulary when the contract confirmed no motif at all", () => {
    const c = emptyContract();
    const v = checkOverviewGrammar(
      "You spotted the fork on the queenside and never let go of the d4 square.",
      c,
    );
    expect(v.map((x) => x.span.toLowerCase())).toContain("fork");
  });

  it("allows tactical vocabulary the contract DID confirm somewhere", () => {
    const c = makeContract([makeInsight({ allowedTacticalKeywords: ["fork"] })]);
    const v = checkOverviewGrammar(
      "You spotted the fork on d4 and never let go of it.",
      c,
    ).filter((x) => x.check === "tactical_keyword");
    expect(v).toEqual([]);
  });

  it("exempts definitional teaching sentences (no square, no SAN, no piece-on-square)", () => {
    const c = emptyContract();
    const v = checkOverviewGrammar(
      "When one piece attacks two at once, that is a fork.",
      c,
    ).filter((x) => x.check === "tactical_keyword");
    expect(v).toEqual([]);
  });
});

describe("the deterministic floor", () => {
  it("falls back to a contract-derived overview when everything is refuted", () => {
    const c = emptyContract();
    const r = refereeOverview("You were winning by +7.70 the whole game.", c);
    expect(r.outcome).toBe("templated");
    expect(r.text).toBe(renderOverviewTemplate(c));
    expect(r.text).not.toContain("+7.70");
  });

  it("the template asserts only contract fields", () => {
    const c = emptyContract();
    const text = renderOverviewTemplate(c);
    expect(text).toContain(String(c.game.moveCount));
    expect(text).toContain(c.game.playerColor === "w" ? "White" : "Black");
    // No eval figures, no SAN, no tactical vocabulary.
    expect(text).not.toMatch(/[+-]\d+\.\d\d/);
    expect(checkOverviewGrammar(text, c)).toEqual([]);
  });
});

describe("the enforced stream routes zero-card reviews through the referee", () => {
  it("buffers, referees, and reports the outcome", async () => {
    const contract = emptyContract();
    const emitted: string[] = [];
    const stream = createEnforcedContractStream({
      contract,
      emit: (t) => emitted.push(t),
      correlationId: "overview",
      refereeMode: "deterministic",
      citationGranularity: "sentence",
      deadlineAtMs: Date.now() + 60_000,
      regenSystem: { stable: "", perUser: "" },
      armingTable: ENFORCE_TABLE,
    });
    const msg =
      "Solid, tidy game with nothing to flag. You held a clean +4.50 edge the whole way. Keep playing longer games.";
    for (let i = 0; i < msg.length; i += 13) stream.push(msg.slice(i, i + 13));
    const summary = await stream.end();

    expect(summary.cards).toEqual([]);
    expect(summary.overviewOutcome).toBe("sentence_drop");
    expect(summary.overviewViolations).toBeGreaterThan(0);
    const shipped = emitted.join("");
    expect(shipped).not.toContain("+4.50");
    expect(shipped).toContain("Solid, tidy game with nothing to flag.");
    expect(summary.finalText).toBe(shipped);
  });

  it("a review WITH cards is untouched by the overview path", async () => {
    const contract = makeContract([makeInsight({})]);
    const emitted: string[] = [];
    const stream = createEnforcedContractStream({
      contract,
      emit: (t) => emitted.push(t),
      correlationId: "overview-cards",
      refereeMode: "deterministic",
      citationGranularity: "sentence",
      deadlineAtMs: Date.now() + 60_000,
      regenSystem: { stable: "", perUser: "" },
      armingTable: ENFORCE_TABLE,
    });
    stream.push("Here is the moment that mattered.\n\n");
    const summary = await stream.end();
    expect(summary.overviewOutcome).toBeNull();
    expect(emitted.join("")).toContain("Here is the moment that mattered.");
  });
});

/**
 * PR-CI-4 citation grammar: fact-id resolution, coverage (sentence +
 * paragraph granularity), invalid-token findings, and the streaming-safe
 * stripper (a token split across deltas never leaks to the client).
 */
import { describe, it, expect } from "vitest";
import {
  checkCitations,
  CitationStripper,
  resolveFactId,
  stripCitations,
  stripGrammarTokenLines,
} from "@/lib/contract/citations";
import { makeInsight } from "./insightFactory";

const insight = makeInsight(); // factIdPrefix M1, 2 lines, 1 motif, 1 relational capture

describe("resolveFactId", () => {
  it("resolves the insight's own prefix and populated families", () => {
    expect(resolveFactId("M1", insight)).toBe(true);
    expect(resolveFactId("M1.pv0", insight)).toBe(true);
    expect(resolveFactId("M1.pv1", insight)).toBe(true);
    expect(resolveFactId("M1.motif0", insight)).toBe(true);
    expect(resolveFactId("M1.rel0", insight)).toBe(true); // one relational capture
    expect(resolveFactId("M1.branch", insight)).toBe(true); // branchPoint set
  });

  it("rejects out-of-range, empty-family, wrong-prefix, and unavailable-source ids", () => {
    expect(resolveFactId("M1.pv2", insight)).toBe(false);
    expect(resolveFactId("M1.motif1", insight)).toBe(false);
    expect(resolveFactId("M1.rel1", insight)).toBe(false);
    expect(resolveFactId("M1.threat0", insight)).toBe(false); // threats null
    expect(resolveFactId("M1.concept0", insight)).toBe(false); // no concepts
    expect(resolveFactId("M1.delta", insight)).toBe(false); // featureDelta null
    expect(resolveFactId("M1.idea", insight)).toBe(false); // engineIdea null
    expect(resolveFactId("M2.pv0", insight)).toBe(false);
    // Degraded sources unavailable ⇒ citing them is fabricated provenance.
    expect(resolveFactId("M1.chessdb", insight)).toBe(false);
    expect(resolveFactId("M1.lc0", insight)).toBe(false);
    expect(resolveFactId("M1.maia", insight)).toBe(false);
    expect(resolveFactId("M1.bogus", insight)).toBe(false);
  });
});

describe("checkCitations", () => {
  it("flags unresolvable tokens as citation_invalid findings", () => {
    const r = checkCitations("The knight lands on e6 [F:M1.pv9].", insight);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].check).toBe("citation_invalid");
    expect(r.tokens).toEqual(["M1.pv9"]);
    expect(r.validTokens).toEqual([]);
  });

  it("computes sentence-level coverage over claim sentences only", () => {
    const prose =
      "Great fighting spirit today!\n\n" + // rhetoric — not a claim
      "Ne6 wins material [F:M1.pv0]. " + // cited claim
      "The knight forks the queen."; // uncited claim
    const r = checkCitations(prose, insight);
    expect(r.claimSentences).toBe(2);
    expect(r.citedClaimSentences).toBe(1);
    expect(r.coverage).toBeCloseTo(0.5);
    expect(r.findings).toHaveLength(0);
  });

  it("paragraph granularity counts a claim as cited when its paragraph carries a token", () => {
    const prose = "Ne6 wins material [F:M1.pv0]. The knight forks the queen.";
    const sentence = checkCitations(prose, insight, "sentence");
    const paragraph = checkCitations(prose, insight, "paragraph");
    expect(sentence.coverage).toBeCloseTo(0.5);
    expect(paragraph.coverage).toBe(1);
  });

  it("a citation token alone never turns rhetoric into a claim sentence", () => {
    const r = checkCitations("Wonderful energy out there [F:M1].", insight);
    expect(r.claimSentences).toBe(0);
    expect(r.coverage).toBe(1);
  });

  it("structural widget lines are excluded from the coverage denominator", () => {
    const prose =
      "Ne6 wins material [F:M1.pv0].\n" +
      "[CONCEPT:fork:Knight Fork Tactics]\n" + // markup naming a keyword
      "[CONTINUATION:11:w]\n";
    const r = checkCitations(prose, insight);
    expect(r.claimSentences).toBe(1);
    expect(r.coverage).toBe(1);
  });

  // ── gate recovery (2026-08-11) ────────────────────────────────────────────
  it("a move number does not fragment one cited sentence into three", () => {
    const prose = "The engine line runs 8... Ba5+ 9. Bd2 Bb4 [F:M1.pv0].";
    const r = checkCitations(prose, insight);
    expect(r.claimSentences).toBe(1);
    expect(r.coverage).toBe(1);
  });

  it("generic [CONCEPT] pedagogy leaves the denominator; concrete concept prose does not", () => {
    const generic =
      "Ne6 wins material [F:M1.pv0].\n" +
      "[CONCEPT:fork:Knight Fork Tactics]\n" +
      "Knight forks punish pieces that stand a hop apart — one move, two targets.\n" +
      "[/CONCEPT]";
    expect(checkCitations(generic, insight).claimSentences).toBe(1);

    const concrete =
      "Ne6 wins material [F:M1.pv0].\n" +
      "[CONCEPT:fork:Knight Fork Tactics]\n" +
      "Here the knight landing on e6 is exactly that pattern.\n" +
      "[/CONCEPT]";
    const r = checkCitations(concrete, insight);
    expect(r.claimSentences).toBe(2);
    expect(r.coverage).toBeCloseTo(0.5);
  });
});

describe("stripGrammarTokenLines", () => {
  it("removes widget/marker lines but keeps prose (incl. bulleted claims)", () => {
    const body =
      "[WHY]\nIdea: grab the fork with Ne6.\n[CONTINUATION:11:w]\n[/WHY]\n" +
      "[CONCEPT:fork:Knight Fork Tactics]\nForks punish loose pieces.\n[/CONCEPT]";
    const out = stripGrammarTokenLines(body);
    expect(out).toContain("Idea: grab the fork with Ne6.");
    expect(out).toContain("Forks punish loose pieces.");
    expect(out).not.toContain("[CONCEPT:");
    expect(out).not.toContain("[CONTINUATION:");
    expect(out).not.toContain("[WHY]");
  });
});

describe("stripping", () => {
  it("stripCitations removes tokens and one leading space", () => {
    expect(stripCitations("wins a piece [F:M1.motif0].")).toBe("wins a piece.");
    expect(stripCitations("[F:M1]Start")).toBe("Start");
  });

  it("CitationStripper never leaks a token split across delta boundaries", () => {
    const s = new CitationStripper();
    const out =
      s.push("The fork wins ") + s.push("[F:M1.mo") + s.push("tif0] material.") + s.flush();
    expect(out).toBe("The fork wins material.");
  });

  it("CitationStripper forwards an unterminated opener at flush (never swallows)", () => {
    const s = new CitationStripper();
    const a = s.push("tail ends with [F:M1.pv0");
    const b = s.flush();
    expect(a + b).toBe("tail ends with [F:M1.pv0");
  });

  it("CitationStripper holds a bare '[' tail then releases it when it is not a token", () => {
    const s = new CitationStripper();
    const out = s.push("see [") + s.push("WHY] section") + s.flush();
    expect(out).toBe("see [WHY] section");
  });
});

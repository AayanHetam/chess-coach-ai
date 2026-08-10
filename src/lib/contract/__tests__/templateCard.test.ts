/**
 * PR-CI-4 template fallback card (ladder floor): referee-safe by
 * construction, sentinel-honest, deterministic tone, honest register when
 * no motif is confirmed.
 */
import { describe, it, expect } from "vitest";
import { refereeInsight } from "@/lib/contract/referee";
import { runInsightChecks } from "@/lib/contract/refereeChecks";
import { parseInsightHeader } from "@/lib/contract/insightGrammar";
import { renderTemplateCard, renderTemplateCardBody } from "@/lib/contract/templateCard";
import { evalFact, makeInsight } from "./insightFactory";

const REFEREE_OPTS = { userRating: 1500, correlationId: "t", playerPerspective: "white" as const };

describe("renderTemplateCard — referee-safe by construction", () => {
  it("passes the full deterministic referee with a confirmed motif", () => {
    const insight = makeInsight({
      sayables: {
        motifs: ["Confirmed: fork by the n on e6 hitting q on d8 and p on g7."],
        relationalCaptures: [],
        relationalHanging: [],
        relationalPins: [],
      },
    });
    const body = renderTemplateCardBody(insight);
    expect(runInsightChecks(body, insight)).toHaveLength(0);
    const result = refereeInsight(body, insight, REFEREE_OPTS);
    expect(result.errorCount).toBe(0);
    expect(body).toContain("fork");
  });

  it("uses the honest no-bluff register when no motif is confirmed", () => {
    const insight = makeInsight({ motifs: [], allowedTacticalKeywords: [] });
    const body = renderTemplateCardBody(insight);
    expect(body).toContain("no single named tactic was verified");
    expect(runInsightChecks(body, insight)).toHaveLength(0);
    expect(refereeInsight(body, insight, REFEREE_OPTS).errorCount).toBe(0);
  });

  it("renders sentinel evals as 'engine data unavailable' — never +0.00", () => {
    const insight = makeInsight({
      motifs: [],
      allowedTacticalKeywords: [],
      evalAfter: evalFact({ cp: 0, mate: null, depth: 0, sentinel: true, display: "engine data unavailable" }),
    });
    const body = renderTemplateCardBody(insight);
    expect(body).toContain("engine data unavailable");
    expect(body).not.toContain("+0.00");
    expect(runInsightChecks(body, insight)).toHaveLength(0);
  });

  it("wraps the body in a parseable server-authoritative header + close token", () => {
    const insight = makeInsight();
    const card = renderTemplateCard(insight);
    expect(card.startsWith("[INSIGHT:11:w:blunder:+1.38:-2.12:Bd3:Ne6]")).toBe(true);
    expect(card.endsWith("[/INSIGHT]")).toBe(true);
    const headerRaw = card.slice("[INSIGHT:".length, card.indexOf("]"));
    const fields = parseInsightHeader(headerRaw);
    expect(fields).not.toBeNull();
    expect(fields!.playedMove).toBe("Bd3");
  });

  it("tone variant is deterministic per insight (no RNG)", () => {
    const insight = makeInsight();
    expect(renderTemplateCardBody(insight)).toBe(renderTemplateCardBody(insight));
    // Different ply parity → the other skeleton.
    const other = makeInsight({ ply: 21 });
    expect(renderTemplateCardBody(other)).not.toBe(renderTemplateCardBody(insight));
  });

  it("prunes optional lines that would re-introduce a violation", () => {
    // A concept whose definition names an UNCONFIRMED tactic keyword must
    // not survive into the card.
    const insight = makeInsight({
      motifs: [],
      allowedTacticalKeywords: [],
      concepts: [
        {
          id: "skewer",
          name: "Skewer Awareness",
          tier: "tactical",
          confidence: 0.9,
          definition: "A skewer forces a valuable piece to move.",
          evidence: "n/a",
        },
      ],
    });
    const body = renderTemplateCardBody(insight);
    expect(body.toLowerCase()).not.toContain("skewer");
    expect(runInsightChecks(body, insight)).toHaveLength(0);
  });
});

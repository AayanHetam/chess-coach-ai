/**
 * PR-CI-3 gate: render↔parse round-trip (plan risk #5 — "two files own the
 * grammar" hazard).
 *
 * One grammar, three consumers, all pinned against each other here:
 *   renderInsightBlock (server renderer, insightGrammar.ts)
 *     → parseInsightHeader (referee-side parser, insightGrammar.ts)
 *     → InsightBlockGate (streaming boundary scanner, blockGate.ts)
 *     → parseInsights (THE SHIPPING CLIENT PARSER, AICoachInsights.parser.ts)
 * If any of the four drifts, this suite goes red before production does.
 */
import { describe, it, expect } from "vitest";
import { parseInsights } from "@/components/AICoachInsights.parser";
import { InsightBlockGate } from "@/lib/contract/blockGate";
import type { CompletedBlock } from "@/lib/contract/blockGate";
import {
  INSIGHT_CLOSE_TOKEN,
  INSIGHT_OPEN_PREFIX,
  matchInsightForHeader,
  parseInsightHeader,
  renderInsightBlock,
  renderInsightHeader,
} from "@/lib/contract/insightGrammar";
import { evalFact, makeContract, makeInsight } from "./insightFactory";

const BODY =
  "This felt natural, but the knight had bigger plans.\n" +
  "[WHY]\nIdea: centralize\nProblem: the fork\nSolution: Ne6\nOutcome: wins material\n[/WHY]";

describe("render → parseInsightHeader (referee-side round trip)", () => {
  it("round-trips every header field from the contract", () => {
    const insight = makeInsight();
    const header = renderInsightHeader(insight);
    expect(header).toBe("[INSIGHT:11:w:blunder:+1.38:-2.12:Bd3:Ne6]");
    const fields = parseInsightHeader(header.slice(INSIGHT_OPEN_PREFIX.length, -1));
    expect(fields).toEqual({
      moveNumber: 11,
      color: "w",
      classification: "blunder",
      evalBefore: "+1.38",
      evalAfter: "-2.12",
      playedMove: "Bd3",
      bestMove: "Ne6",
    });
  });

  it("bestSan-less insights repeat playedMove (prompt contract) and mate displays survive", () => {
    const insight = makeInsight({
      bestSan: null,
      playedSan: "Qxg4",
      evalAfter: evalFact({ cp: null, mate: 2, display: "M+2" }),
    });
    const fields = parseInsightHeader(
      renderInsightHeader(insight).slice(INSIGHT_OPEN_PREFIX.length, -1),
    );
    expect(fields?.playedMove).toBe("Qxg4");
    expect(fields?.bestMove).toBe("Qxg4");
    expect(fields?.evalAfter).toBe("M+2");
  });

  it("malformed headers parse to null exactly like the client parser drops them", () => {
    expect(parseInsightHeader("12:w:blunder")).toBeNull(); // <6 fields
    expect(parseInsightHeader("xx:w:blunder:+1:+1:e4:e4")).toBeNull(); // NaN move
    expect(parseInsightHeader("12:x:blunder:+1:+1:e4:e4")).toBeNull(); // bad color
    expect(parseInsightHeader("12:w::+1:+1:e4:e4")).toBeNull(); // empty class
    expect(parseInsightHeader("12:w:blunder:+1:+1::e4")).toBeNull(); // empty played
  });
});

describe("render → parseInsights (SHIPPING CLIENT parser round trip)", () => {
  it("the client parser reads back exactly what the server renderer emitted", () => {
    const insight = makeInsight();
    const message = `Let's walk through the key moments.\n\n${renderInsightBlock(insight, BODY)}`;
    const parsed = parseInsights(message);
    expect(parsed.prefix).toBe("Let's walk through the key moments.");
    expect(parsed.insights).toHaveLength(1);
    expect(parsed.insights[0]).toMatchObject({
      moveNumber: 11,
      color: "w",
      classification: "blunder",
      evalBefore: "+1.38",
      evalAfter: "-2.12",
      playedMove: "Bd3",
      bestMove: "Ne6",
      moveLabel: "11.",
      headline: "This felt natural, but the knight had bigger plans.",
      why: "Idea: centralize\nProblem: the fork\nSolution: Ne6\nOutcome: wins material",
    });
    expect(parsed.suffix).toBe("");
  });

  it("black-move rendering yields the client's '<n>...' move label", () => {
    const insight = makeInsight({ color: "b", colorName: "Black", moveNumber: 24 });
    const parsed = parseInsights(renderInsightBlock(insight, "Headline."));
    expect(parsed.insights[0].moveLabel).toBe("24...");
  });
});

describe("render → InsightBlockGate (streaming boundary round trip)", () => {
  it("the gate reconstructs the exact rendered block and its header parses back", () => {
    const insight = makeInsight();
    const rendered = renderInsightBlock(insight, BODY);
    const blocks: CompletedBlock[] = [];
    const gate = new InsightBlockGate({ mode: "shadow", onBlock: (b) => blocks.push(b) });
    // 3-char deltas: markers split across pushes.
    for (let i = 0; i < rendered.length; i += 3) gate.push(rendered.slice(i, i + 3));
    gate.end();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe(rendered);
    expect(rendered.endsWith(INSIGHT_CLOSE_TOKEN)).toBe(true);
    const fields = parseInsightHeader(blocks[0].headerRaw);
    expect(fields?.moveNumber).toBe(11);
    expect(fields?.playedMove).toBe("Bd3");
  });
});

describe("matchInsightForHeader", () => {
  it("anchors by moveNumber + color and reports playedSan agreement", () => {
    const a = makeInsight();
    const b = makeInsight({ moveNumber: 14, color: "b", playedSan: "g5", factIdPrefix: "M2" });
    const contract = makeContract([a, b]);
    const fields = parseInsightHeader("14:b:mistake:-0.5:+1.2:g5:f4")!;
    const match = matchInsightForHeader(fields, contract);
    expect(match?.insight.factIdPrefix).toBe("M2");
    expect(match?.playedSanMatches).toBe(true);
    // Fabricated played move: still anchored, flagged.
    const lied = matchInsightForHeader({ ...fields, playedMove: "h4" }, contract);
    expect(lied?.insight.factIdPrefix).toBe("M2");
    expect(lied?.playedSanMatches).toBe(false);
    // No such move in the contract at all.
    expect(matchInsightForHeader({ ...fields, moveNumber: 99 }, contract)).toBeNull();
  });
});

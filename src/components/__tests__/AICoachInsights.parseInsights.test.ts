import { describe, it, expect } from "vitest";
import { parseInsights } from "../AICoachInsights.parser";

// The INSIGHT schema is defined in src/lib/prompts/coachChatPrompt.ts:285.
// parseOneInsight has been a silent failure point in the past — the
// previous `parts.length < 3` guard accepted partial headers like
// `[INSIGHT:12:w:blunder]` and rendered cards with `undefined`
// playedMove / evalBefore / evalAfter, which the carousel then displayed
// as a broken half-card with no clickable move ref.

const fullInsight = (header: string, body = "Headline text here.") =>
  `[INSIGHT:${header}]\n${body}\n[/INSIGHT]`;

describe("parseInsights — header schema validation", () => {
  it("parses a fully-formed 7-field header", () => {
    const raw = fullInsight(
      "12:w:blunder:+1.38:-1.88:Bxh7:Nxe5",
      "Bxh7 looks active but gives up the bishop pair without follow-up.",
    );
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(1);
    expect(insights[0]).toMatchObject({
      moveNumber: 12,
      color: "w",
      moveLabel: "12.",
      classification: "blunder",
      evalBefore: "+1.38",
      evalAfter: "-1.88",
      playedMove: "Bxh7",
      bestMove: "Nxe5",
    });
    expect(insights[0].headline).toContain("Bxh7 looks active");
  });

  it("accepts a 6-field header (missing bestMove) — bestMove is undefined", () => {
    const raw = fullInsight("12:w:blunder:+1.38:-1.88:Bxh7");
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(1);
    expect(insights[0].playedMove).toBe("Bxh7");
    expect(insights[0].bestMove).toBeUndefined();
  });

  it("rejects a 5-field header (missing playedMove)", () => {
    // playedMove is what becomes clickable in the card; rendering without
    // it is worse than dropping the card.
    const raw = fullInsight("12:w:blunder:+1.38:-1.88");
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(0);
  });

  it("rejects a 3-field header (the historical truncation bug)", () => {
    // Before the tightening, this case rendered a card with undefined
    // evalBefore / evalAfter / playedMove. Now it is dropped.
    const raw = fullInsight("12:w:blunder");
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(0);
  });

  it("rejects a header with non-numeric moveNumber", () => {
    const raw = fullInsight("xx:w:blunder:+1.38:-1.88:Bxh7:Nxe5");
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(0);
  });

  it("rejects a header with color other than w/b", () => {
    const raw = fullInsight("12:x:blunder:+1.38:-1.88:Bxh7:Nxe5");
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(0);
  });

  it("rejects a header with empty classification", () => {
    const raw = fullInsight("12:w::+1.38:-1.88:Bxh7:Nxe5");
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(0);
  });

  it("rejects a header with empty playedMove", () => {
    const raw = fullInsight("12:w:blunder:+1.38:-1.88::Nxe5");
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(0);
  });

  it("derives moveLabel for black moves with ellipsis form", () => {
    const raw = fullInsight("18:b:mistake:+0.20:-1.10:Nxe5:Nf3");
    const { insights } = parseInsights(raw);
    expect(insights[0].moveLabel).toBe("18...");
    expect(insights[0].color).toBe("b");
  });

  it("normalises classification and color casing", () => {
    const raw = fullInsight("12:W:BLUNDER:+1.38:-1.88:Bxh7:Nxe5");
    const { insights } = parseInsights(raw);
    expect(insights[0].color).toBe("w");
    expect(insights[0].classification).toBe("blunder");
  });
});

describe("parseInsights — body tag extraction", () => {
  it("extracts WHY / THREATS / ROLES sections out of the body", () => {
    const raw = `[INSIGHT:12:w:blunder:+1.38:-1.88:Bxh7:Nxe5]
The sacrifice gives back the bishop pair without follow-up.
[WHY]
Idea: stir up kingside threats
Problem: no attacker reaches h-file in time
Solution: develop with Nxe5 first
Outcome: keeps the structural plus
[/WHY]
[THREATS]
- Black ...Qh4 with tempo
- Loose bishop on h7
[/THREATS]
[ROLES]
- f3 knight: the attacker that didn't show up
[/ROLES]
[/INSIGHT]`;
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(1);
    const insight = insights[0];
    expect(insight.why).toContain("Idea: stir up kingside threats");
    expect(insight.threats).toContain("Loose bishop on h7");
    expect(insight.roles).toContain("f3 knight");
    // Headline should have the tagged sections stripped out.
    expect(insight.headline).toContain("The sacrifice gives back");
    expect(insight.headline).not.toContain("[WHY]");
    expect(insight.headline).not.toContain("[/THREATS]");
  });

  it("extracts CONCEPT tag with themeKey and displayName attrs", () => {
    const raw = `[INSIGHT:12:w:blunder:+1.38:-1.88:Bxh7:Nxe5]
Headline.
[CONCEPT:bishop_sac_unsound:Unsound Bishop Sacrifice]
Bishop sacrifices on h7 only work when there's a knight ready to jump in.
[/CONCEPT]
[/INSIGHT]`;
    const { insights } = parseInsights(raw);
    expect(insights[0].conceptKey).toBe("bishop_sac_unsound");
    expect(insights[0].conceptName).toBe("Unsound Bishop Sacrifice");
    expect(insights[0].conceptBody).toContain("Bishop sacrifices on h7");
  });
});

describe("parseInsights — stream / multi-insight handling", () => {
  it("returns no insights for input with no INSIGHT tags", () => {
    const raw = "Just some prose, no structured cards here.";
    const { insights, prefix, suffix } = parseInsights(raw);
    expect(insights).toHaveLength(0);
    expect(prefix).toBe(raw);
    expect(suffix).toBe("");
  });

  it("stops at an unclosed INSIGHT block (mid-stream)", () => {
    // While the LLM is still streaming, an open [INSIGHT:...] without a
    // matching [/INSIGHT] is the normal state. The parser must not render
    // a broken half-card; it should stop and let the renderer wait for
    // the close tag in a later chunk.
    const raw = `[INSIGHT:12:w:blunder:+1.38:-1.88:Bxh7:Nxe5]
The card body is still streaming...`;
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(0);
  });

  it("parses multiple insights in sequence", () => {
    const raw = [
      "Quick intro line.",
      fullInsight("12:w:blunder:+1.38:-1.88:Bxh7:Nxe5", "First card."),
      fullInsight("18:b:mistake:+0.20:-1.10:Nxe5:Nf3", "Second card."),
    ].join("\n");
    const { insights, prefix } = parseInsights(raw);
    expect(insights).toHaveLength(2);
    expect(insights[0].moveNumber).toBe(12);
    expect(insights[1].moveNumber).toBe(18);
    expect(prefix).toContain("Quick intro line.");
  });

  it("skips a malformed insight but keeps the surrounding valid ones", () => {
    const raw = [
      fullInsight("12:w:blunder:+1.38:-1.88:Bxh7:Nxe5", "Valid card."),
      fullInsight("xx:w:blunder", "Malformed — should be dropped."),
      fullInsight("18:b:mistake:+0.20:-1.10:Nxe5:Nf3", "Another valid card."),
    ].join("\n");
    const { insights } = parseInsights(raw);
    expect(insights).toHaveLength(2);
    expect(insights.map((i) => i.moveNumber)).toEqual([12, 18]);
  });
});

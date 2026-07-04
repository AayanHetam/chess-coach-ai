import { describe, it, expect } from "vitest";
import { parseCoachInsights, stripControlTags } from "../coachInsights";
// Cross-check against the production React parser (pure .ts, no JSX) to keep
// the calibration view faithful to what users actually see.
import { parseInsights } from "@/components/AICoachInsights.parser";

// A real coach response (fx-evans-gambit#15 from
// runs/helpbaseline-mqmjkzq5-09f9ad.json), trimmed to two insights.
const SAMPLE = `Let's walk through the key moments.

[INSIGHT:7:b:mistake:-1.05:-1.15:dxc3:Nxd4]
This felt like a clever pawn grab, but it handed White an opportunity that was hard to see coming.
[WHY]
Idea: Black wanted to snatch the pawn on c3 and push a dangerous passed pawn down the board.
Problem: Capturing on c3 gave White a powerful queen move that creates immediate threats Black can't fully answer.
Solution: Taking the knight on d4 instead keeps things simple and holds onto the material advantage safely.
Outcome: Black stays ahead in material without giving White any dangerous counterplay.
[CONTINUATION:7:b]
[MAIA_CONTINUATION:7:b]
[/WHY]
[THREATS]
- White's queen on b3 now threatens the pawn on f7.
[/THREATS]
[/INSIGHT]
[INSIGHT:8:w:mistake:+0.39:+1.46:Qb3:Qb3]
White found a strong idea, though the follow-up needed care.
[WHY]
Idea: White wanted to pressure f7 and the long diagonal.
Problem: Black has defensive resources if White rushes.
Solution: Qb3 was actually best here, hitting two targets at once.
Outcome: White builds a serious initiative.
[CONTINUATION:8:w]
[MAIA_CONTINUATION:8:w]
[/WHY]
[ROLES]
- The bishop on c4 eyes f7.
[/ROLES]
[CONCEPT:double_attack:Double Attack]
A double attack hits two targets so only one can be saved.
[/CONCEPT]
[/INSIGHT]`;

describe("parseCoachInsights — field order + WHY extraction", () => {
  const { fullGameAnalysis, insights } = parseCoachInsights(SAMPLE);

  it("isolates the intro prose as fullGameAnalysis", () => {
    expect(fullGameAnalysis).toBe("Let's walk through the key moments.");
  });

  it("parses two insights", () => {
    expect(insights).toHaveLength(2);
  });

  it("decodes the header fields in the documented order", () => {
    expect(insights[0]).toMatchObject({
      moveNumber: 7,
      color: "b",
      classification: "mistake",
      evalBefore: "-1.05",
      evalAfter: "-1.15",
      movePlayedSan: "dxc3",
      bestMoveSan: "Nxd4",
    });
    expect(insights[1]).toMatchObject({
      moveNumber: 8,
      color: "w",
      classification: "mistake",
      evalBefore: "+0.39",
      evalAfter: "+1.46",
      movePlayedSan: "Qb3",
      bestMoveSan: "Qb3", // repeats playedMove when the move WAS best
    });
  });

  it("extracts the headline (description) without any tags", () => {
    expect(insights[0].description).toBe(
      "This felt like a clever pawn grab, but it handed White an opportunity that was hard to see coming."
    );
    expect(insights[0].description).not.toMatch(/\[/);
  });

  it("extracts the WHY body and strips continuation markers", () => {
    expect(insights[0].why).toContain("Idea: Black wanted to snatch the pawn");
    expect(insights[0].why).toContain("Outcome: Black stays ahead");
    expect(insights[0].why).not.toMatch(
      /\[CONTINUATION|\[MAIA_CONTINUATION|\[WHY|\[\/WHY/
    );
  });

  it("keeps ROLES/CONCEPT bodies OUT of the WHY (they're separate sections)", () => {
    expect(insights[1].why).not.toContain("eyes f7");
    expect(insights[1].why).not.toContain("Double Attack");
  });
});

describe("parseCoachInsights — robustness", () => {
  it("returns the whole text as fullGameAnalysis when there are no insights", () => {
    const r = parseCoachInsights("Just some plain prose, no cards.");
    expect(r.insights).toHaveLength(0);
    expect(r.fullGameAnalysis).toBe("Just some plain prose, no cards.");
  });

  it("ignores a malformed (<6-field) header", () => {
    const r = parseCoachInsights(
      "intro\n[INSIGHT:12:w:blunder]\nbad\n[/INSIGHT]"
    );
    expect(r.insights).toHaveLength(0);
  });

  it("ignores an unclosed (truncated) block", () => {
    const r = parseCoachInsights(
      "intro\n[INSIGHT:7:b:mistake:-1.0:-1.1:dxc3:Nxd4]\nstreaming…"
    );
    expect(r.insights).toHaveLength(0);
  });

  it("handles empty / undefined input", () => {
    expect(parseCoachInsights("").insights).toHaveLength(0);
    // @ts-expect-error — guard against undefined coachText at runtime
    expect(parseCoachInsights(undefined).insights).toHaveLength(0);
  });
});

describe("stripControlTags", () => {
  it("removes ROLES (the tag the original cleanCoachText missed)", () => {
    const out = stripControlTags("Idea: foo.\n[ROLES]\n- bar.\n[/ROLES]");
    expect(out).not.toMatch(/\[ROLES|\[\/ROLES/);
    expect(out).toContain("Idea: foo.");
    expect(out).toContain("- bar.");
  });
});

describe("parseCoachInsights mirrors the production React parser", () => {
  it("same insight count, header fields, and intro/headline on the real sample", () => {
    const node = parseCoachInsights(SAMPLE);
    const react = parseInsights(SAMPLE);
    expect(node.insights).toHaveLength(react.insights.length);
    expect(node.fullGameAnalysis).toBe(react.prefix); // intro prose match
    node.insights.forEach((ni, i) => {
      const ri = react.insights[i];
      expect(ni.moveNumber).toBe(ri.moveNumber);
      expect(ni.color).toBe(ri.color);
      expect(ni.classification).toBe(ri.classification);
      expect(ni.evalBefore).toBe(ri.evalBefore);
      expect(ni.evalAfter).toBe(ri.evalAfter);
      expect(ni.movePlayedSan).toBe(ri.playedMove);
      // React parser leaves bestMove undefined when empty; we use "".
      expect(ni.bestMoveSan).toBe(ri.bestMove ?? "");
      expect(ni.description).toBe(ri.headline);
    });
  });
});

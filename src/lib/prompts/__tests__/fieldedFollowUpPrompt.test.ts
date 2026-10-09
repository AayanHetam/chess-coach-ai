import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIELDED_PROMPT_VERSION,
  fieldedTurnReminder,
  getFieldedFollowUpSystemPromptStable,
  type FieldedMomentLabel,
} from "../fieldedFollowUpPrompt";
import { getFollowUpSystemPromptStable } from "../followUpPrompt";
import { MOMENT_BUDGET } from "@/lib/coach/moment";
import { coachPersonalities } from "@/config/coachPersonalities";

const ids = Object.keys(coachPersonalities);

describe("the fielded system prompt", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is one prompt in the one voice, whatever the id", () => {
    vi.stubEnv("COACH_ONE_MASTI", "1");
    const one = getFieldedFollowUpSystemPromptStable(ids[0]);
    for (const id of ids)
      expect(getFieldedFollowUpSystemPromptStable(id)).toBe(one);
    expect(one).toMatchSnapshot();
    expect(FIELDED_PROMPT_VERSION).toBe("fielded-1");
  });

  it("carries the v1 prompt's purpose, never-write list, coaching rules and calibration verbatim", () => {
    const v1 = getFollowUpSystemPromptStable(ids[0]);
    const fielded = getFieldedFollowUpSystemPromptStable(ids[0]);
    const shared = v1
      .split("\n\n")
      .filter((p) =>
        [
          "WHAT AN ANSWER IS FOR",
          "NEVER WRITE:",
          "COACH THE PLAYER",
          "SKILL-LEVEL CALIBRATION",
        ].some((h) => p.startsWith(h))
      );
    expect(shared).toHaveLength(4);
    for (const p of shared) expect(fielded).toContain(p);
  });

  it("asks for the fields, never the prose shape, the tokens or a number", () => {
    const p = getFieldedFollowUpSystemPromptStable(ids[0]);
    expect(p).toContain("THE FIELDS OF EVERY ANSWER");
    expect(p).not.toContain("[CONTINUATION");
    expect(p).not.toContain("Copy evaluations");
    expect(p).not.toContain("THE SHAPE");
    expect(p).not.toContain("BUDGET:");
    expect(p).toContain(`${MOMENT_BUDGET.openingWords} words`);
    expect(p).toContain(`${MOMENT_BUDGET.lessonWords} words`);
    expect(p.length).toBeLessThan(7500);
  });
});

describe("fieldedTurnReminder", () => {
  const nc7: FieldedMomentLabel = {
    label: "8. Nc7+",
    moveNumber: 8,
    color: "w",
    ownLabels: ["8. Nc7+", "8. Qxc1"],
    askedLabel: null,
    hasEngineLine: true,
    hasPlayedLine: true,
  };
  it("names the move, its own moves and the lines the proof may reference", () => {
    expect(fieldedTurnReminder(nc7)).toMatchSnapshot();
    expect(fieldedTurnReminder({ ...nc7, hasEngineLine: false })).toContain(
      '{"kind":"played"} for the game\'s line (there is no engine line for this move), or null'
    );
    expect(
      fieldedTurnReminder({
        ...nc7,
        hasEngineLine: false,
        hasPlayedLine: false,
      })
    ).toContain("proof: null.");
    expect(fieldedTurnReminder({ ...nc7, askedLabel: "8. Qxc1" })).toContain(
      "and the player asks about 8. Qxc1 instead"
    );
    expect(
      fieldedTurnReminder(nc7, { side: "w", player: "w", confirmed: true })
    ).toMatch(/This turn is about White's moves, the player's own\.\]$/);
  });

  it("never offers the engine's line as one instead of the move it starts with", () => {
    const r = fieldedTurnReminder({ ...nc7, engineIsPlayed: true });
    expect(r).toContain(
      `{"kind":"engine"} for the engine's line, which starts with the move played`
    );
    expect(r).not.toContain("instead of 8. Nc7+");
  });

  it("an asked move that cannot be played there is said to be so, and never named", () => {
    const r = fieldedTurnReminder({ ...nc7, askedIllegal: "8. Qxa8" });
    expect(r).toContain(
      "the move the player asks about cannot be played in this position: say so without writing it"
    );
    expect(r).not.toContain("Qxa8");
  });
});

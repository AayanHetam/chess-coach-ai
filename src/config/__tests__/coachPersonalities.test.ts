import { describe, expect, it } from "vitest";
import {
  coachPersonalities,
  defaultPersonalityId,
  getPersonalityById,
} from "@/config/coachPersonalities";
import { isMastiMood } from "@/components/masti/manifest";

const EMOJI = new RegExp("\\p{Extended_Pictographic}", "u");
const OLD_NAMES =
  /Gelareh|Sloan|Blitz Master Mike|Professor Sam|Adrina|Liana|Chesstalker/;
/** The six attitudes retired on 2026-10-07. A stored id may still name one. */
const RETIRED_IDS = [
  "grandmaster",
  "tactical",
  "strategic",
  "beginner",
  "trash_talk",
  "chesstalker",
];

describe("one Masti: the personality config is a one-entry shim", () => {
  it("holds the one attitude the flag-off prompt still wears", () => {
    expect(coachPersonalities.map((p) => p.id)).toEqual(["friendly"]);
    expect(defaultPersonalityId).toBe("friendly");
  });

  it("speaks as Masti, wears a real face, and carries no old name or emoji", () => {
    const [p] = coachPersonalities;
    expect(p.name).toMatch(/Masti/);
    expect(p.name).not.toMatch(EMOJI);
    expect(p.name).not.toMatch(OLD_NAMES);
    expect(isMastiMood(p.mood)).toBe(true);
    expect(p.systemPromptOverride).toMatch(
      /You are Masti, the Chess Masti monkey/
    );
    expect(p.systemPromptOverride).toContain("FRIENDLY MENTOR ATTITUDE");
    expect(p.systemPromptOverride).not.toMatch(OLD_NAMES);
  });

  it("resolves every id, the retired ones included, to that entry", () => {
    const friendly = getPersonalityById("friendly");
    expect(friendly.id).toBe("friendly");
    for (const id of [...RETIRED_IDS, "not-an-attitude", ""]) {
      expect(getPersonalityById(id), id).toBe(friendly);
    }
  });
});

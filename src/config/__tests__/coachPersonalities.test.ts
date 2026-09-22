import { describe, expect, it } from "vitest";
import {
  coachPersonalities,
  defaultPersonalityId,
  getPersonalityById,
} from "@/config/coachPersonalities";
import { isMastiMood } from "@/components/masti/manifest";

const EMOJI = new RegExp("\\p{Extended_Pictographic}", "u");
const OLD_NAMES = /Gelareh|Sloan|Blitz Master Mike|Professor Sam|Adrina|Liana|Chesstalker/;

describe("the coach personalities are Masti's attitudes", () => {
  it("keeps the seven stable ids, in order", () => {
    expect(coachPersonalities.map((p) => p.id)).toEqual([
      "grandmaster",
      "friendly",
      "tactical",
      "strategic",
      "beginner",
      "trash_talk",
      "chesstalker",
    ]);
  });

  it("names every attitude as a form of Masti", () => {
    for (const p of coachPersonalities) {
      expect(p.name, p.id).toMatch(/Masti/);
      expect(p.name, p.id).not.toMatch(OLD_NAMES);
    }
  });

  it("gives every attitude a real mood, and does not wear one face for all", () => {
    for (const p of coachPersonalities) {
      expect(isMastiMood(p.mood), p.id).toBe(true);
    }
    expect(new Set(coachPersonalities.map((p) => p.mood)).size).toBeGreaterThanOrEqual(5);
  });

  it("speaks as Masti in the greeting and the prompt override", () => {
    for (const p of coachPersonalities) {
      expect(p.greeting, p.id).toMatch(/Masti/);
      expect(p.systemPromptOverride, p.id).toMatch(/You are Masti, the Chess Masti monkey/);
      expect(p.systemPromptOverride, p.id).not.toMatch(OLD_NAMES);
      expect(p.greeting, p.id).not.toMatch(OLD_NAMES);
    }
  });

  it("shows no emoji in the picker copy", () => {
    for (const p of coachPersonalities) {
      expect(`${p.name} ${p.title} ${p.description}`, p.id).not.toMatch(EMOJI);
    }
  });

  it("falls back to the friendly mentor", () => {
    expect(defaultPersonalityId).toBe("friendly");
    expect(getPersonalityById("not-an-attitude").id).toBe("friendly");
    expect(getPersonalityById("grandmaster").mood).toBe("thinking");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { coachPersonalities } from "@/config/coachPersonalities";
import {
  MASTI_VOICE,
  ONE_MASTI_ID,
  coachVoiceFor,
  isOneMasti,
} from "../mastiVoice";

const EMOJI = new RegExp("\\p{Extended_Pictographic}", "u");
const OLD_NAMES =
  /Gelareh|Sloan|Blitz Master Mike|Professor Sam|Adrina|Liana|Chesstalker/;

describe("the one voice", () => {
  it("speaks as Masti, calibrates by the skill section, and wears no emoji or old name", () => {
    expect(MASTI_VOICE).toMatch(/^TONE AND STYLE \(Masti\):/);
    expect(MASTI_VOICE).toContain("You are Masti, the Chess Masti monkey");
    expect(MASTI_VOICE).toContain("SKILL-LEVEL CALIBRATION");
    expect(MASTI_VOICE).toContain("Blame the move, never the player");
    expect(MASTI_VOICE).not.toMatch(EMOJI);
    expect(MASTI_VOICE).not.toMatch(OLD_NAMES);
    // It leaves length and shape to the sections that own them: no budget of its own.
    expect(MASTI_VOICE).not.toMatch(/\d+ words/);
    expect(MASTI_VOICE).not.toMatch(/\[INSIGHT/);
  });
});

describe("the flag", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off unless COACH_ONE_MASTI says so", () => {
    vi.stubEnv("COACH_ONE_MASTI", "");
    expect(isOneMasti()).toBe(false);
    for (const v of ["0", "false", "no", "off", " "]) {
      vi.stubEnv("COACH_ONE_MASTI", v);
      expect(isOneMasti(), v).toBe(false);
    }
    for (const v of ["1", "true", "yes", " TRUE\n"]) {
      vi.stubEnv("COACH_ONE_MASTI", v);
      expect(isOneMasti(), v).toBe(true);
    }
  });

  it("off: the one attitude left, whatever the id", () => {
    vi.stubEnv("COACH_ONE_MASTI", "");
    for (const id of ["friendly", "grandmaster", "not-an-attitude"]) {
      const voice = coachVoiceFor(id);
      expect(voice.id, id).toBe("friendly");
      expect(voice.noun, id).toBe("attitude");
      expect(voice.block, id).toContain("FRIENDLY MENTOR ATTITUDE");
    }
  });

  it("on: the one voice for every id", () => {
    vi.stubEnv("COACH_ONE_MASTI", "1");
    const ids = [...coachPersonalities.map((p) => p.id), "grandmaster"];
    for (const id of ids) {
      const voice = coachVoiceFor(id);
      expect(voice.block, id).toBe(MASTI_VOICE);
      expect(voice.id, id).toBe(ONE_MASTI_ID);
      expect(voice.noun, id).toBe("voice");
    }
  });
});

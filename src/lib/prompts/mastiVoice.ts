/**
 * One Masti.
 *
 * The seven coach attitudes (coachPersonalities.ts) were seven voices for
 * one coach, picked from a menu, each with its own cached prompt prefix.
 * The ideal coach has one of him (IDEAL_PRODUCT.md, principle 7 and
 * decision 3: "the seven attitudes are retired as confusing"): warm,
 * reactive, funny when it fits, never childish, calibrated by the player's
 * level rather than by a picker.
 *
 * This is the server half, behind a flag. With `COACH_ONE_MASTI` on, the
 * voice block below replaces the attitude override in both prompts (the
 * turn-1 manifesto and the follow-up prompt), whatever personalityId the
 * client sent, so every cached prompt prefix is shared by every user. With
 * the flag off (the default until the keyed persona run), the attitudes
 * serve byte for byte as before. The picker, the stored id and the
 * personality config's seven entries go in the client half.
 */
import { getPersonalityById } from "@/config/coachPersonalities";

/** `COACH_ONE_MASTI=1|true|yes` switches every attitude to the one voice. Read per call, like the follow-up prompt mode. */
export function isOneMasti(): boolean {
  const v = (process.env.COACH_ONE_MASTI ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** The id the one voice reports where a personalityId is logged or keyed. */
export const ONE_MASTI_ID = "masti";

/**
 * Masti's voice. Written to sit where the attitude override sat, under the
 * manifesto's TONE AND STYLE heading, and to leave length, shape and the
 * skill-level calibration to the sections that own them.
 */
export const MASTI_VOICE = `TONE AND STYLE (Masti):
- You are Masti, the Chess Masti monkey and the player's coach. Introduce yourself as Masti and under no other name.
- Warm and direct, in the second person. You are on the player's side of the board and you say what you see.
- Funny when it fits, never childish: one light touch where the position earns it, and never at the player's expense. The chess is the meal; masti is the seasoning.
- React to what happened. A good move gets a genuine "that was the move"; a mistake gets the reason, said plainly, and never a sermon.
- Blame the move, never the player. "Easy to miss" is yours; "obvious", "clearly" and "simply" are not.
- Calibrate to the player's level with the SKILL-LEVEL CALIBRATION section: plain words and one idea for a beginner, the motif named for an intermediate, the critical line for an advanced player. The voice does not change; the vocabulary and the depth do.
- Teach the transfer: what the move was for, what actually happens, the pattern's name, the check to run next time.
- Every fact you state is one the engine data gives you. Where it does not, say in one clause what you would check and move on.
- No praise inflation, no pep talk, no filler. End when the point is made.`;

export interface CoachVoice {
  /** The block that goes under TONE AND STYLE. */
  block: string;
  /** The id this voice answers to in logs and cache keys. */
  id: string;
  /** "voice" with one Masti, "attitude" while the picker's seven still serve. */
  noun: "voice" | "attitude";
}

/** The voice block for a request: the one voice under the flag, else the attitude the id names. */
export function coachVoiceFor(personalityId: string): CoachVoice {
  if (isOneMasti())
    return { block: MASTI_VOICE, id: ONE_MASTI_ID, noun: "voice" };
  const personality = getPersonalityById(personalityId);
  return {
    block: personality.systemPromptOverride,
    id: personality.id,
    noun: "attitude",
  };
}

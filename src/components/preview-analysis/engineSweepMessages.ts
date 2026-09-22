/**
 * What Masti says around the engine sweep on /analysis.
 *
 * Loading a game starts a whole-game Stockfish pass, and the composer stays
 * locked until it lands (see `resolveEngineGate`). Two UI-authored coach
 * turns frame that wait:
 *
 *   1. the load greeting asks the reader to hold on while he goes through
 *      the game (`engineSweep: "sweeping"`), and
 *   2. once the sweep returns, a follow-up says he is ready and offers the
 *      review (`engineSweep: "ready"`).
 *
 * Both are `synthetic`: the UI wrote them, so they are never replayed to the
 * model as things it said (see `buildConversationHistory`). The reducer that
 * appends the follow-up is pure and keyed on the marker, not the text, so a
 * restored transcript (which carries neither marker) is left alone and a
 * sweep announces itself exactly once.
 */

import type { MastiMood } from "@/components/masti";

export type EngineSweepStatus = "sweeping" | "ready";

/** The shape a transcript turn needs for the reducer to read it. */
export interface EngineSweepAware {
  content: string;
  engineSweep?: EngineSweepStatus;
}

export interface EngineSweepMessage extends EngineSweepAware {
  role: "coach";
  content: string;
  ply: number;
  synthetic: true;
  mascot: MastiMood;
  engineSweep: EngineSweepStatus;
}

/** Masti, while Stockfish is going through the game. */
export const ENGINE_SWEEPING_LINE =
  "Wait a second, I am going through your game.";

/** Masti, once the sweep has landed and the composer unlocks. */
export const ENGINE_READY_LINE =
  "Ok, now ask me anything you want. Do you want me to analyze your game?";

export interface SweepGreetingHeaders {
  White?: string;
  Black?: string;
  Date?: string;
}

/**
 * The load greeting for a game with moves. Names the players when the PGN
 * carries them, then asks for a second. chess.js fills an absent Date with
 * the placeholder "????.??.??", which is not a year.
 */
export function buildSweepGreeting(
  headers: SweepGreetingHeaders
): EngineSweepMessage {
  const year = headers.Date?.split(".")[0];
  const yearSuffix = year && /^\d{4}$/.test(year) ? ` (${year})` : "";
  const loaded =
    headers.White && headers.Black
      ? `Loaded **${headers.White} vs ${headers.Black}**${yearSuffix}.`
      : "Loaded a new game.";
  return {
    role: "coach",
    content: `${loaded} ${ENGINE_SWEEPING_LINE}`,
    ply: 0,
    synthetic: true,
    mascot: "thinking",
    engineSweep: "sweeping",
  };
}

/** The follow-up turn that lands with the evaluations. */
export function buildEngineReadyMessage(): EngineSweepMessage {
  return {
    role: "coach",
    content: ENGINE_READY_LINE,
    ply: 0,
    synthetic: true,
    mascot: "wave",
    engineSweep: "ready",
  };
}

/**
 * Append the "ready" turn to a transcript that is still waiting on the sweep.
 *
 * Returns the SAME array when there is nothing to do, so a state setter fed
 * this reducer bails out of a re-render:
 *   - no "sweeping" greeting in the transcript (a restored conversation, a
 *     bare-position load, a chat the user opened some other way), or
 *   - the "ready" turn is already there (the sweep announced itself once).
 */
export function appendEngineReady<M extends EngineSweepAware>(
  messages: M[]
): Array<M | EngineSweepMessage> {
  const sweeping = messages.some((m) => m.engineSweep === "sweeping");
  if (!sweeping) return messages;
  const announced = messages.some((m) => m.engineSweep === "ready");
  if (announced) return messages;
  return [...messages, buildEngineReadyMessage()];
}

/**
 * What Masti says around the engine sweep on /analysis.
 *
 * Loading a game starts a whole-game Stockfish pass, and the composer stays
 * locked until it lands (see `resolveEngineGate`). UI-authored coach turns
 * frame that wait:
 *
 *   1. the load greeting asks the reader to hold on while he goes through
 *      the game (`engineSweep: "sweeping"`), then exactly one outcome:
 *   2. once the sweep returns, a follow-up says he is ready and offers the
 *      review (`engineSweep: "ready"`), or
 *   3. when no evaluation is ever coming (the engine cannot boot, or the
 *      sweep errored) he says so, because the gate has already opened the
 *      composer and a "wait a second" that never resolves is a broken
 *      promise (`engineSweep: "unavailable"`).
 *
 * All are `synthetic`: the UI wrote them, so they are never replayed to the
 * model as things it said (see `buildConversationHistory`). The reducers
 * that append an outcome are pure and keyed on the markers, not the text, so
 * a restored transcript (which carries none) is left alone and a sweep
 * announces its outcome exactly once. A depth or engine change re-runs the
 * sweep without a second narration: the greeting frames the first pass only.
 */

import type { MastiMood } from "@/components/masti";

export type EngineSweepStatus = "sweeping" | "ready" | "unavailable";

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

/** Masti, when the sweep he asked the reader to wait for is never coming. */
export const ENGINE_UNAVAILABLE_LINE =
  "Hmm, the engine would not run on this one. Ask me anything anyway, I will answer without the evaluations.";

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

/** The turn that lands when the engine cannot boot or the sweep errored. */
export function buildEngineUnavailableMessage(): EngineSweepMessage {
  return {
    role: "coach",
    content: ENGINE_UNAVAILABLE_LINE,
    ply: 0,
    synthetic: true,
    mascot: "nervous",
    engineSweep: "unavailable",
  };
}

/**
 * Append an outcome turn to a transcript that is still waiting on the sweep.
 *
 * Returns the SAME array when there is nothing to do, so a state setter fed
 * this reducer bails out of a re-render:
 *   - no "sweeping" greeting in the transcript (a restored conversation, a
 *     bare-position load, a chat the user opened some other way), or
 *   - an outcome is already there (a sweep announces itself once, and a
 *     failure after a landing, or a landing after a failure, is not a second
 *     story to tell).
 */
function appendSweepOutcome<M extends EngineSweepAware>(
  messages: M[],
  outcome: EngineSweepMessage
): Array<M | EngineSweepMessage> {
  const sweeping = messages.some((m) => m.engineSweep === "sweeping");
  if (!sweeping) return messages;
  const announced = messages.some(
    (m) => m.engineSweep === "ready" || m.engineSweep === "unavailable"
  );
  if (announced) return messages;
  return [...messages, outcome];
}

/** The sweep returned: Masti opens the floor. */
export function appendEngineReady<M extends EngineSweepAware>(
  messages: M[]
): Array<M | EngineSweepMessage> {
  return appendSweepOutcome(messages, buildEngineReadyMessage());
}

/** No evaluation is ever coming: Masti says so instead of waiting forever. */
export function appendEngineUnavailable<M extends EngineSweepAware>(
  messages: M[]
): Array<M | EngineSweepMessage> {
  return appendSweepOutcome(messages, buildEngineUnavailableMessage());
}

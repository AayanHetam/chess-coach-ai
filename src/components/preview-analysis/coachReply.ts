/**
 * One coach reply, from the placeholder to the answer or the error.
 *
 * The analysis page asks the coach from three places: the send box, a
 * move's "Ask Masti" and the Masters tab's takeover. Each used to carry its
 * own copy of the same forty lines: the thinking state, the delta that
 * fills the placeholder, the server's corrected text, the anchor that moves
 * the board, the truncation flag, the sign-in and outage banners and the
 * reset in `finally`. Three copies meant every edit on the reply path was
 * three edits, and they had drifted (the banner copy differs by site).
 *
 * This is the one copy. It is written against a sink of the page's setters
 * so it runs under vitest with a fake stream, and the page mounts it with
 * one memo of those setters. The transport (`streamCoachReply`, the two-tier
 * fetch) stays with the page; this module gets it as a function of the
 * reply's handlers.
 *
 * Behaviour for behaviour what the three sites did, quirks included: the
 * banner copy is still per site (`COACH_REPLY_BANNERS` makes the drift
 * visible; unifying it is a copy decision, not this change), a network
 * error wears the outage face, the work a site does after the stream runs
 * inside the same `try` (a failure there is caught like a network error),
 * and `fromPly` is whatever the caller held.
 */
import type { MastiMood } from "@/components/masti/manifest";
import { coachErrorMood, type CoachErrorKind } from "@/components/masti/mood";
import type { PageAction, PageTurn } from "@/lib/coach/pageActions";
import type { MomentProse } from "@/lib/coach/moment";
import type { CardMoment } from "./cardMoment";

/** The coach endpoint answered 401: the session is gone or was never there. */
export class CoachAuthError extends Error {}
/** The coach endpoint answered with any other failing status. */
export class CoachApiError extends Error {
  constructor(public status: number) {
    super(`Coach API returned ${status}`);
  }
}

/** Masti's view of a request: the gap before the first token, then tokens, then rest. */
export type CoachReplyPhase = "idle" | "waiting" | "streaming";

/** Where the question came from. Only the banner copy differs. */
export type CoachReplySite = "send" | "move" | "takeover";

/** The move the server resolved the question to (questionAnchor.ts). */
export interface CoachReplyAnchor {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
}

/** What the transport calls while the answer arrives. */
export interface CoachReplyHandlers {
  onDelta: (chunk: string) => void;
  /** D1: the server shipped a corrected answer; it replaces the streamed text. */
  onCorrected: (correctedText: string) => void;
  /** D4: the stream ended without a `done` event; the answer is a fragment. */
  onTruncated: () => void;
  onAnchor: (anchor: CoachReplyAnchor) => void;
  /**
   * The server answered an order itself, with no model call
   * (lib/coach/pageActions.ts): the turn is the page's, not the coach's.
   * `turn` is null when the page cannot read what was served.
   */
  onPageTurn?: (turn: PageTurn | null) => void;
  /** Things the page does beside an answer (the router's, from pathway PR 3.4). */
  onActions?: (actions: PageAction[]) => void;
  /** The coach's reading of the turn's side (the route's `perspective` echo), raw. */
  onPerspective?: (echo: unknown) => void;
  /**
   * The answer's fields (followUpMoment.ts), read and matched to the text
   * the transport is about to deliver: the transcript draws them.
   */
  onMoment?: (moment: MomentProse) => void;
  /**
   * A review's key moment as fields (cardMoment.ts), the card it names and
   * its prose, sent before the card's text: the transcript draws the card
   * from it while the card's text is the one it was lifted from.
   */
  onTurnMoment?: (moment: CardMoment) => void;
}

/** A patch for the coach's placeholder: the last message, when it is the coach's. */
export interface CoachReplyPatch {
  content?: string;
  incomplete?: boolean;
  synthetic?: boolean;
  mascot?: MastiMood;
  /** The answer's fields; the content stays the text either way. */
  moment?: MomentProse;
  /** The review's key moments so far, in the order they came. */
  turnMoments?: CardMoment[];
}

/** Where the coach moved the board, and the way back. */
export interface CoachReplyJump {
  fromPly: number;
  toPly: number;
  label: string;
}

/**
 * The placeholder reducer: patch the last message when it is the coach's,
 * else leave the transcript alone. The page's sink runs it under
 * setMessages; it is here so the guard is pinned by the module's test.
 */
export function patchLastCoachMessage<T extends { role: string }>(
  prev: T[],
  patch: CoachReplyPatch
): T[] {
  if (prev.length === 0) return prev;
  const last = prev[prev.length - 1];
  if (last.role !== "coach") return prev;
  return [...prev.slice(0, -1), { ...last, ...patch }];
}

/** The page's side: the setters one reply drives. */
export interface CoachReplySink {
  patchLastCoach(patch: CoachReplyPatch): void;
  setThinking(on: boolean): void;
  setPhase(phase: CoachReplyPhase): void;
  setError(kind: CoachErrorKind | null): void;
  /** Put the anchored position on the board and leave a way back. */
  jumpTo(jump: CoachReplyJump): void;
  /**
   * Carry out an order the server answered for the page: drop the empty
   * placeholder, keep the question out of the model's history, and do and
   * acknowledge it as if it had been read before the fetch.
   */
  servePageTurn(turn: PageTurn | null): void;
  /** Do what the server asked beside its answer; the answer is still the answer. */
  applyActions(actions: PageAction[]): void;
  /**
   * The coach's reading of the turn's side (standingSide.ts): the page may
   * take its standing side from it. Optional: a sink without it ignores it.
   */
  notePerspective?(echo: unknown): void;
}

export interface CoachReplyRun {
  /** The transport: given the reply's handlers, streams the answer and resolves with its text. */
  stream: (handlers: CoachReplyHandlers) => Promise<string>;
  /** The ply the board held when the question was sent: the way back from an anchor jump. */
  fromPly: number;
  site: CoachReplySite;
  sink: CoachReplySink;
  /** The site's own work once the answer is in, with the answer's text. */
  onDone?: (text: string) => void;
}

interface CoachReplyBanner {
  auth: string;
  api: (status: number) => string;
  network: string;
}

const COMPACT_BANNER: CoachReplyBanner = {
  auth: "**Sign-in required** — the coach needs a free account. Use **Sign in** above and ask again.",
  api: (status) => `**Coach is offline** (HTTP ${status}).`,
  network: "**Network error** reaching the coach.",
};

/**
 * The error banner per site, as each site wrote it. The send box's copy
 * predates the sign-in gate on the composer and the Sign in button above
 * the transcript; the other two were written after. Kept apart so this
 * change is behaviour-identical. One edit here unifies them.
 */
export const COACH_REPLY_BANNERS: Record<CoachReplySite, CoachReplyBanner> = {
  send: {
    auth: "**Sign-in required** — the coach endpoint is auth-gated. Sign in on chessmasti.com and refresh.",
    api: (status) =>
      `**Coach is offline** (HTTP ${status}). The LLM provider returned an error — try again in a moment.`,
    network: "**Network error** reaching the coach. Try again?",
  },
  move: COMPACT_BANNER,
  takeover: COMPACT_BANNER,
};

/** What went wrong, for the error face. */
export function coachReplyErrorKind(err: unknown): CoachErrorKind {
  if (err instanceof CoachAuthError) return "auth";
  if (err instanceof CoachApiError) return "api";
  return "network";
}

/** The banner the placeholder is rewritten with. */
export function coachReplyBanner(site: CoachReplySite, err: unknown): string {
  const banner = COACH_REPLY_BANNERS[site];
  if (err instanceof CoachAuthError) return banner.auth;
  if (err instanceof CoachApiError) return banner.api(err.status);
  return banner.network;
}

/** "8. Nc7+" / "8... Nc7+" */
export function coachReplyAnchorLabel(anchor: CoachReplyAnchor): string {
  return `${anchor.moveNumber}${anchor.color === "b" ? "..." : "."} ${anchor.san}`;
}

/**
 * Run one reply. The caller has already appended the user's message and the
 * coach's empty placeholder; this fills the placeholder, moves the board when
 * the answer names a move, rewrites the placeholder with a banner when the
 * request fails, and puts the page back at rest either way.
 */
export async function runCoachReply(run: CoachReplyRun): Promise<void> {
  const { stream, fromPly, site, sink, onDone } = run;
  sink.setThinking(true);
  sink.setPhase("waiting");
  // The error face describes the latest request only.
  sink.setError(null);

  let accumulated = "";
  // An order the server answered itself: its text is not an answer, and
  // nothing the coach would do after an answer follows.
  let served = false;
  // The review's key moments, one patch each as they come.
  let turnMoments: CardMoment[] = [];
  try {
    await stream({
      onDelta: (chunk) => {
        if (served) return;
        if (accumulated.length === 0) sink.setPhase("streaming");
        accumulated += chunk;
        sink.patchLastCoach({ content: accumulated });
      },
      // D1: the server's corrected text replaces the raw stream, so the
      // corrected copy is what gets replayed on the next turn.
      onCorrected: (correctedText) => {
        accumulated = correctedText;
        sink.patchLastCoach({ content: correctedText });
      },
      // The answer is about a move the question named: put that position
      // on the board, and leave a way back.
      onAnchor: (anchor) => {
        if (anchor.ply === fromPly) return;
        sink.jumpTo({
          fromPly,
          toPly: anchor.ply,
          label: coachReplyAnchorLabel(anchor),
        });
      },
      // D4: no `done` event arrived — the answer is a fragment.
      onTruncated: () => {
        sink.patchLastCoach({ incomplete: true, mascot: "nervous" });
      },
      onPageTurn: (turn) => {
        if (served) return;
        served = true;
        sink.servePageTurn(turn);
      },
      // Only ever from the response's own `actions` field, never from the
      // answer's words: nothing the model writes reaches the board.
      onActions: (actions) => {
        if (served || actions.length === 0) return;
        sink.applyActions(actions);
      },
      onPerspective: (echo) => {
        if (served) return;
        sink.notePerspective?.(echo);
      },
      onMoment: (moment) => {
        if (served) return;
        sink.patchLastCoach({ moment });
      },
      onTurnMoment: (moment) => {
        if (served) return;
        turnMoments = [...turnMoments, moment];
        sink.patchLastCoach({ turnMoments });
      },
    });
    if (!served) onDone?.(accumulated);
  } catch (err) {
    const kind = coachReplyErrorKind(err);
    sink.setError(kind);
    // D3: the banner overwrites the streamed text in place. Without the
    // synthetic flag the model reads "**Coach is offline** (HTTP 502)" as
    // something IT said on its previous turn.
    sink.patchLastCoach({
      content: coachReplyBanner(site, err),
      synthetic: true,
      incomplete: undefined,
      // The banner is not the answer the fields were.
      moment: undefined,
      turnMoments: undefined,
      // A sign-in wall is a nervous face; an outage is a dizzy one, and so
      // is a network failure (the face never had a third state).
      mascot: coachErrorMood(kind === "auth" ? "auth" : "api"),
    });
  } finally {
    sink.setThinking(false);
    sink.setPhase("idle");
  }
}

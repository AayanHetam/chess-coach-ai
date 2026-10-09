/**
 * A turn-1 key moment on the wire (pathway 4.1).
 *
 * Under COACH_TURN1_MOMENTS the enforced review stream sends each card the
 * ladder passed as a moment of its own (src/lib/contract/turnMoments.ts),
 * an SSE event `{ type: "moment", moment }` just before the card's text.
 * The moment names the card it was lifted from, and `card.key` is the hash
 * of that card's exact text, so a reader draws the moment only beside the
 * text it came from.
 *
 * This module has no runtime import (types only), so a Playwright spec can
 * import it by relative path and compute the key itself.
 */
import type { Moment, Side } from "./moment";

/** The SSE `type` of the event that carries a turn-1 moment. */
export const TURN_MOMENT_EVENT = "moment" as const;

/** The card a turn-1 moment was lifted from. */
export interface TurnCardRef {
  /** The contract insight's cite prefix: "M2", "I1". */
  factIdPrefix: string;
  moveNumber: number;
  color: Side;
  playedSan: string;
  /** cardKey of the card as emitted, "[INSIGHT:" through "[/INSIGHT]". */
  key: string;
}

/** A moment lifted from a turn-1 card, with the card it names. */
export interface TurnMoment extends Moment {
  card: TurnCardRef;
}

/**
 * FNV-1a 32 over UTF-16 code units, as 8 lowercase hex digits. An
 * integrity key that ties a moment to the text it was lifted from, not a
 * secret and not a defence against a forger.
 */
export function cardKey(cardText: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < cardText.length; i++) {
    h ^= cardText.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

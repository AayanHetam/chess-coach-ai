"use client";

import type { PartnerCreative, PartnerUtm } from "./PartnerBanner";
import type { VariantId } from "./previewOptions";
import {
  TURN_TWO_META,
  turnTwoCreative,
  type TurnTwoId,
} from "./chessusaTurn2";

/**
 * The creative the older iframe preview at /partners/chessusa cycles through
 * with ?v=. It is the same three Turn-2 units the production links serve —
 * /partners/ChessUSA/1, /2 and /3 — so the shell's device toggle shows the
 * real creative at a real width, and nothing under this prefix can show an
 * advertiser one thing while the links show another.
 *
 * This file used to carry two placeholder HTML units and an image pair whose
 * PNGs were never added, so the third option rendered as a broken image on
 * the live domain. Both are gone. The <picture> path in PartnerBanner stays
 * typed and supported for an advertiser-supplied file; nothing here uses it.
 */

/** Bare destination. UTM is applied by PartnerBanner from the prop below. */
export const CHESSUSA_HREF = "https://www.chessusa.com/";

/** The shell's three ?v= ids, in order, onto the three production creatives. */
const SHELL_TO_TURN_TWO: Record<VariantId, TurnTwoId> = {
  editorial: "1",
  bold: "2",
  three: "3",
};

export function chessusaUtm(variant: VariantId): PartnerUtm {
  return {
    source: "chessmasti",
    medium: "display",
    campaign: "chessusa_2026q3",
    // Tag with the creative's own code (2a/2b/2c), the same value the
    // production links send, so shell clicks and link clicks reconcile.
    content: TURN_TWO_META[SHELL_TO_TURN_TWO[variant]].code,
  };
}

export function chessusaCreative(variant: VariantId): PartnerCreative {
  const id = SHELL_TO_TURN_TWO[variant];
  return {
    kind: "html",
    alt: TURN_TWO_META[id].alt,
    node: turnTwoCreative(id),
  };
}

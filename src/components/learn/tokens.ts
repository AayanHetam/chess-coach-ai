// The colours and curves every piece of /learn shares.
//
// Ember stays the action colour everywhere; gold is this surface's identity
// (the nav already wears it for Learn); rose carries warnings; green is the
// one solid "done" state. Kept in one place so the HUD, the meter, the cards
// and the quiz cannot drift into four slightly different golds.

import { ACCENTS } from "@/components/ui/accents";

export const EMBER = ACCENTS.ember.bright;
export const GOLD = ACCENTS.gold;
export const ROSE = ACCENTS.rose;
export const GOOD = "#86EFAC";
export const MONO = '"SF Mono", ui-monospace, Menlo, monospace';

/** The product's ease-out, shared with the chooser and the quiz. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** A pop: the spring a chip or a check lands with. */
export const POP = { type: "spring", stiffness: 420, damping: 24, mass: 0.7 } as const;

/** The keyboard focus ring, ember on every control whatever colour it wears. */
export const FOCUS = { "&:focus-visible": { outline: `2px solid ${EMBER}`, outlineOffset: 2 } } as const;

export const GLASS = "linear-gradient(180deg, rgba(20,22,28,0.8) 0%, rgba(12,14,20,0.8) 100%)";

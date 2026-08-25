// What kind of game an opening gives you, said in colour.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY COLOUR AT ALL
//
// Every choice already carries a `character` and a `load`, and `suggestionScore`
// already ranks by them. None of it was ever shown. A player scrolling eleven
// options against 1.d4 saw eleven identical grey cards in an order they had no
// way to account for, which is the same as no order at all.
//
// A hue is read before a word is. Attacking openings are red across the whole
// product — in the quiz option you picked, on the card, and on the tag — so the
// ranking becomes legible without anyone reading a sentence about it.
//
// The palette deliberately avoids two colours already spoken for: ember
// (#FB923C) is the brand accent and means "look here", and the good-green
// (#86EFAC) means "this is fine". A character that borrowed either would be
// making a recommendation it has no business making — the Najdorf is red
// because it attacks, not because it is wrong.
// ─────────────────────────────────────────────────────────────────────────────

import type { Character, RepertoireChoice } from '@/types/repertoire';
import { levelFit, type Band } from '@/lib/repertoire/levels';
import { MAX_SUGGESTION_SCORE, suggestionScore, type QuizAnswers } from '@/lib/repertoire/store';

export interface CharacterStyle {
  /** One word for the tag. Adjectival, so it reads as a property of the line. */
  label: string;
  /** Hue at 400-level tint: >= 7:1 against the page's near-black. */
  colour: string;
  /** What the player was asked, echoed back when a choice does not match it. */
  asked: string;
}

/**
 * Four characters, four hues.
 *
 * `solid` is blue and `attack` is red because that is the pairing everybody
 * already holds — hot and sharp against cool and concrete. The other two are
 * placed away from both so no two adjacent tags share a hue family: purple for
 * counterattack (unbalanced, reactive) and teal for structure (slow, technical).
 */
export const CHARACTER_STYLE: Record<Character, CharacterStyle> = {
  attack: { label: 'attacking', colour: '#F87171', asked: 'to attack' },
  solid: { label: 'solid', colour: '#60A5FA', asked: 'to be hard to beat' },
  counterattack: {
    label: 'counterattacking',
    colour: '#C084FC',
    asked: 'to punish mistakes',
  },
  structure: { label: 'positional', colour: '#2DD4BF', asked: 'to outplay them slowly' },
};

export const CHARACTERS = Object.keys(CHARACTER_STYLE) as Character[];

/**
 * How a choice fits this player, on the two axes that are genuinely separate.
 *
 * LEVEL is measured — we know their rating and the band the opening suits.
 * STYLE is asked — two quiz answers, and null when they were never given.
 *
 * They were one field for about an hour, and the King's Indian is what proved
 * they cannot be. It is `attack`, `heavy` and sound at 900. A beginner who asks
 * for counterattacking positions is still shown it FIRST, because level leads
 * the ranking by design — and a single verdict field made that card say only
 * "doesn't fit your playstyle", dropping the reason it was at the top. The
 * player is then looking at an opening in first place with one objection on it
 * and no stated merit, which reads as a mistake by the page.
 *
 * Two axes, so the card can say both things: this is pitched at you, AND it is
 * not the game you asked for. That is the actual situation.
 */
export interface Fit {
  /** Always available: level is measured, never self-reported. */
  level: 'suits' | 'stretch' | 'neutral';
  /**
   * Null when the quiz was never answered — absence stays absence.
   *
   * `neutral` is the important value, and it exists because the first version
   * of this did not have it. There are four characters and the player picks
   * one, so roughly three cards in four are "a different character" — and
   * tagging all of them "doesn't fit your playstyle" put a negative on five of
   * the eight suggestions against 1.d4. A label on the DEFAULT state is not
   * information, it is wallpaper: it is read as decoration within two cards and
   * then carries nothing on the one card where it would have mattered.
   *
   * So `poor` is reserved for a choice that agrees with them on NEITHER axis —
   * not the kind of game they asked for AND not the amount of theory. That is
   * a real statement about a real minority. Merely having a different character
   * is `neutral`, and the coloured tag has already said which one it is.
   */
  style: 'match' | 'poor' | 'neutral' | null;
  /** Level, theory load and character all line up. The only unqualified yes. */
  recommended: boolean;
}

/**
 * At or below this, nothing the player asked for is present.
 *
 * suggestionScore gives +2 for an exact theory-load match and +1 for an
 * adjacent one, +2 for the character. So 0 is the only score meaning "the
 * opposite end of the theory scale AND a different kind of game" — nothing
 * they asked for is present.
 *
 * The threshold was MEASURED, not chosen. Over the shipped map, across all
 * twelve possible quiz answers and every slot with three or more options:
 *
 *   at 1 — 50% of all cards tagged, and one real list (a heavy /
 *          counterattacking player looking at White's first move) tagged
 *          6 of 6. A page that objects to every available option is not
 *          advising anybody, it is just refusing.
 *   at 0 — 12% of all cards, worst single list 2 of 4.
 */
export const POOR_FIT_AT = 0;

export function fitOf(
  choice: Pick<RepertoireChoice, 'load' | 'level' | 'character'>,
  quiz: QuizAnswers | null,
  band: Band
): Fit {
  const reach = levelFit(choice, band);
  const level: Fit['level'] = reach < 0 ? 'stretch' : reach >= 2 ? 'suits' : 'neutral';
  // No quiz means no answers, so there is nothing a taste verdict could be
  // derived from. Defaulting to 'mismatch' would tell somebody an opening is
  // wrong for a playstyle they never stated; defaulting to 'match' would tell
  // them it is right. Both invent an answer, so neither is allowed.
  const score = quiz ? suggestionScore(choice, quiz) : 0;
  const style: Fit['style'] = !quiz
    ? null
    : choice.character === quiz.character
      ? 'match'
      : score <= POOR_FIT_AT
        ? 'poor'
        : 'neutral';
  // A stretch is never an unqualified yes however well the taste lines up:
  // levelFit is negative there, so this cannot fire. Stated as `level ===
  // 'suits'` rather than `!== 'stretch'` so a future third level value cannot
  // quietly slip into being a recommendation.
  const recommended = level === 'suits' && quiz !== null && score === MAX_SUGGESTION_SCORE;
  return { level, style, recommended };
}

/**
 * How often you actually meet this, for shares small enough that a percentage
 * stops meaning anything.
 *
 * 4% and 30% are both "a percentage" and read as the same kind of thing on a
 * row. "About 1 game in 25" does not: it is a number of games, and a number of
 * games is a thing a player can picture. Returns null above the threshold —
 * "1 game in 3" is true and worthless.
 */
export const RARE_BELOW = 0.05;

export function rarity(share: number): string | null {
  if (!Number.isFinite(share) || share <= 0) return null;
  if (share >= RARE_BELOW) return null;
  const oneIn = Math.round(1 / share);
  // A share this small is under the corpus's own resolution, so the exact
  // denominator is noise. Say the floor and stop.
  if (oneIn >= 200) return '1 game in 200+';
  // To the nearest 5 above 25: 1-in-63 is not more informative than 1-in-65,
  // and the false precision invites arithmetic the corpus cannot support.
  const rounded = oneIn > 25 ? Math.round(oneIn / 5) * 5 : oneIn;
  return `1 game in ${rounded}`;
}

// The player's own bracket: what they answered, and what they picked.
//
// localStorage, for the same reason the trainer's session is: this is one
// person's working copy on one device and it has to survive a reload with no
// network. Every read is defensive, because a throw here happens on mount and
// would take /learn down entirely.

import { levelFit, type Band } from '@/lib/repertoire/levels';
import type {
  Character,
  RepertoireChoice,
  RepertoirePick,
  TheoryLoad,
} from '@/types/repertoire';

const KEY = 'cm.repertoire.bracket.v1';

export interface QuizAnswers {
  load: TheoryLoad;
  character: Character;
}

export interface BracketState {
  v: 1;
  /** Null until the quiz is done. Its absence is what triggers the quiz. */
  quiz: QuizAnswers | null;
  white: RepertoirePick[];
  black: RepertoirePick[];
  updatedAt: number;
}

export const EMPTY: BracketState = { v: 1, quiz: null, white: [], black: [], updatedAt: 0 };

function storeKey(account: string): string {
  return `${KEY}:${account.toLowerCase()}`;
}

const isPick = (p: unknown): p is RepertoirePick =>
  !!p && typeof p === 'object' && typeof (p as RepertoirePick).slotId === 'string';

export function loadBracket(account: string): BracketState {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(storeKey(account));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return EMPTY;
    const s = parsed as Partial<BracketState>;
    if (s.v !== 1) return EMPTY;
    return {
      v: 1,
      quiz: s.quiz && typeof s.quiz === 'object' ? s.quiz : null,
      white: Array.isArray(s.white) ? s.white.filter(isPick) : [],
      black: Array.isArray(s.black) ? s.black.filter(isPick) : [],
      updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
    };
  } catch {
    return EMPTY;
  }
}

export function saveBracket(account: string, state: BracketState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storeKey(account), JSON.stringify(state));
  } catch {
    // Storage full or disabled costs the saved bracket, never the session.
  }
}

/** Replace the pick at a slot, or clear it when `pick` is null. */
export function setPick(
  picks: RepertoirePick[],
  slotId: string,
  pick: RepertoirePick | null
): RepertoirePick[] {
  const without = picks.filter(p => p.slotId !== slotId);
  return pick ? [...without, pick] : without;
}

/**
 * Clearing a slot must clear everything it opened.
 *
 * Otherwise a player who switches from the Grünfeld to the Nimzo-Indian keeps
 * their anti-Trompowsky answer sitting in a slot the new choice never creates,
 * and it counts toward a coverage number for a branch they will never reach.
 */
export function clearBelow(
  picks: RepertoirePick[],
  slotId: string,
  childrenOf: (slotId: string, choiceId?: string) => string[]
): RepertoirePick[] {
  const doomed = new Set<string>();
  const walk = (id: string, choiceId?: string) => {
    for (const child of childrenOf(id, choiceId)) {
      if (doomed.has(child)) continue;
      doomed.add(child);
      walk(child, picks.find(p => p.slotId === child)?.choiceId);
    }
  };
  walk(slotId, picks.find(p => p.slotId === slotId)?.choiceId);
  return picks.filter(p => p.slotId !== slotId && !doomed.has(p.slotId));
}

/**
 * How well a choice matches what they told us.
 *
 * A gentle ranking, not a filter. Someone who said "light theory" is still
 * shown the Najdorf, because the quiz is two questions and the player knows
 * things about themselves that two questions cannot reach.
 */
/**
 * The score a choice gets when BOTH quiz answers match it exactly.
 *
 * Stated as a constant so callers can ask "is this a perfect match?" without
 * hard-coding 4, and pinned by a test that scores a deliberately-matching
 * choice — if the weights below ever change, the test fails rather than the
 * "heavily recommended" tag quietly never appearing again.
 */
export const MAX_SUGGESTION_SCORE = 4;

export function suggestionScore(
  // Narrowed to the two fields it actually reads. Demanding a whole
  // RepertoireChoice made the function untestable without inventing a diagram,
  // an ECO code and a coverage kind for a judgement that depends on none of
  // them — and callers that only hold a judgement had to fabricate the rest.
  choice: Pick<RepertoireChoice, 'load' | 'character'>,
  quiz: QuizAnswers | null
): number {
  if (!quiz) return 0;
  let score = 0;
  if (choice.load === quiz.load) score += 2;
  else if (
    (quiz.load === 'medium' && choice.load !== 'medium') ||
    (choice.load === 'medium' && quiz.load !== 'medium')
  ) {
    score += 1; // adjacent, not opposite
  }
  if (choice.character === quiz.character) score += 2;
  return score;
}

/**
 * Choices for a slot, best match first.
 *
 * LEVEL leads, and it leads by a wide enough margin that taste cannot override
 * it. Someone rated 700 who says they want sharp attacking positions should be
 * offered the King's Gambit and the Vienna, not the Najdorf — the taste is
 * real, and there is a version of it that will not cost them a year.
 *
 * It stays a RANKING and never becomes a filter. Everything is still on the
 * list, and what is above their level says so on its own card.
 */
export function rankChoices(
  choices: RepertoireChoice[],
  quiz: QuizAnswers | null,
  band?: Band
): RepertoireChoice[] {
  return [...choices].sort((a, b) => {
    if (band) {
      const byLevel = levelFit(b, band) - levelFit(a, band);
      if (byLevel !== 0) return byLevel;
    }
    const byFit = suggestionScore(b, quiz) - suggestionScore(a, quiz);
    if (byFit !== 0) return byFit;
    // `move` choices absorb nothing by definition, so comparing their absorb
    // against a real system would sort 1.e4 below every opening in the list.
    const aAbs = a.coverage === 'move' ? 0.5 : a.absorbs;
    const bAbs = b.coverage === 'move' ? 0.5 : b.absorbs;
    return bAbs - aAbs;
  });
}

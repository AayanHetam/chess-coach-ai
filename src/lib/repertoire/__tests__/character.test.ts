// Colour and tags are a CLAIM about the player, made from two quiz answers.
//
// The failure this file exists to prevent is the page telling somebody an
// opening is wrong for a playstyle they never stated. Two questions is a thin
// basis for a verdict at the best of times; inventing one out of a missing
// answer would be worse than staying quiet, and staying quiet is free.
//
// The other guarded thing is precedence. A choice can be off-style AND two
// bands above at once, and only one tag is shown. Showing the cheap objection
// and swallowing the expensive one is how a page recommends a year of
// memorisation with a note about taste.

import { describe, expect, it } from 'vitest';
import {
  CHARACTERS,
  CHARACTER_STYLE,
  POOR_FIT_AT,
  RARE_BELOW,
  fitOf,
  rarity,
} from '@/lib/repertoire/character';
import { BANDS, bandFor } from '@/lib/repertoire/levels';
import { MAX_SUGGESTION_SCORE, suggestionScore } from '@/lib/repertoire/store';
import type { Character, RepertoireChoice, TheoryLoad } from '@/types/repertoire';

type Judged = Pick<RepertoireChoice, 'load' | 'level' | 'character'>;

const choice = (
  character: Character,
  load: TheoryLoad,
  level: RepertoireChoice['level'] = 'beginner'
): Judged => ({ character, load, level });

const improving = bandFor(1300);

describe('MAX_SUGGESTION_SCORE', () => {
  // Pins the constant to the function. If the weights in suggestionScore ever
  // change, "heavily recommended" would silently stop being reachable and no
  // other test in the repo would notice — the tag would just never appear.
  it('is exactly what a choice matching BOTH answers scores', () => {
    const scored = suggestionScore(choice('attack', 'heavy'), {
      load: 'heavy',
      character: 'attack',
    });
    expect(scored).toBe(MAX_SUGGESTION_SCORE);
  });

  it('is not reachable when only one answer matches', () => {
    const oneAxis = suggestionScore(choice('attack', 'light'), {
      load: 'heavy',
      character: 'attack',
    });
    expect(oneAxis).toBeLessThan(MAX_SUGGESTION_SCORE);
  });
});

describe('fitOf', () => {
  // ── The input whose answer is zero by definition ─────────────────────────
  // No quiz means no answers, so there is nothing a taste verdict could be
  // derived FROM. `style` must be null for every character — not 'mismatch',
  // which asserts a preference the player never gave, and not 'match', which
  // asserts the opposite one.
  it('makes no style claim at all when the quiz was never answered', () => {
    for (const character of CHARACTERS) {
      const fit = fitOf(choice(character, 'medium'), null, improving);
      expect(fit.style).toBeNull();
      expect(fit.recommended).toBe(false);
    }
  });

  it('still rates level with no quiz, because level is measured not asked', () => {
    expect(fitOf(choice('attack', 'light', 'beginner'), null, improving).level).toBe('suits');
    expect(fitOf(choice('attack', 'light', 'strong'), null, bandFor(600)).level).toBe('stretch');
  });

  // ── The case that forced two axes apart ──────────────────────────────────
  // The King's Indian as shipped: attacking, heavy, sound from 'new' upward.
  // A 700 who asked for counterattacking positions is shown it FIRST, because
  // level leads the ranking. The card has to be able to say both things —
  // collapsing them left the top suggestion carrying an objection and no
  // stated merit, which reads as a bug in the page.
  it('says a choice suits their level AND is off their style at once', () => {
    const kingsIndian = choice('attack', 'heavy', 'new');
    const fit = fitOf(kingsIndian, { load: 'heavy', character: 'counterattack' }, bandFor(700));
    expect(fit.level).toBe('suits');
    // Not 'poor': the theory load is exactly what they asked for. A different
    // character on its own is the default state, not a complaint.
    expect(fit.style).toBe('neutral');
    expect(fit.recommended).toBe(false);
  });

  // ── Precedence inside a single axis ──────────────────────────────────────
  it('is never a recommendation when the level is a stretch, taste regardless', () => {
    const perfectButFar = choice('attack', 'heavy', 'strong');
    // Every quiz answer lines up...
    expect(suggestionScore(perfectButFar, { load: 'heavy', character: 'attack' })).toBe(
      MAX_SUGGESTION_SCORE
    );
    // ...and it is still three bands above them, so it is not recommended.
    const fit = fitOf(perfectButFar, { load: 'heavy', character: 'attack' }, bandFor(600));
    expect(fit.level).toBe('stretch');
    expect(fit.style).toBe('match');
    expect(fit.recommended).toBe(false);
  });

  // ── The three positive verdicts ──────────────────────────────────────────
  it('recommends only when level, load and character all line up', () => {
    const quiz = { load: 'light' as TheoryLoad, character: 'solid' as Character };
    expect(fitOf(choice('solid', 'light', 'new'), quiz, improving).recommended).toBe(true);
    // Same choice, load off, is no longer an unqualified yes — but the style
    // still matches, so nothing negative is claimed either.
    const loadOff = fitOf(choice('solid', 'heavy', 'new'), quiz, improving);
    expect(loadOff.recommended).toBe(false);
    expect(loadOff.style).toBe('match');
    expect(loadOff.level).toBe('suits');
  });

  // ── The reason `neutral` exists ──────────────────────────────────────────
  // Four characters, one answer: three cards in four differ. The first cut of
  // this tagged every one of them "doesn't fit your playstyle" and put a
  // negative on five of the eight suggestions against 1.d4. A label on the
  // default state is wallpaper — read as decoration within two cards, and
  // therefore carrying nothing on the card where it mattered.
  it('does not complain about a choice that merely has a different character', () => {
    // Different character, but exactly the theory load they asked for.
    expect(
      fitOf(choice('structure', 'light', 'new'), { load: 'light', character: 'attack' }, improving)
        .style
    ).toBe('neutral');
  });

  it('complains only when NEITHER axis is what they asked for', () => {
    // Different character AND the opposite end of the theory scale.
    const neither = fitOf(
      choice('structure', 'heavy', 'new'),
      { load: 'light', character: 'attack' },
      improving
    );
    expect(neither.style).toBe('poor');
    expect(suggestionScore(choice('structure', 'heavy'), { load: 'light', character: 'attack' }))
      .toBeLessThanOrEqual(POOR_FIT_AT);
  });

  it('stays quiet when only the character differs, whatever the character', () => {
    // Hold the load at exactly what they asked for and vary only the character:
    // the page must not object to any of the four.
    const quiz = { load: 'medium' as TheoryLoad, character: 'attack' as Character };
    const complaints = CHARACTERS.filter(
      c => fitOf(choice(c, 'medium', 'new'), quiz, improving).style === 'poor'
    );
    expect(complaints).toEqual([]);
  });

  it('stays quiet when the load is merely adjacent', () => {
    // "A fair amount of theory" against a heavy opening is a near miss, not a
    // rejection. At the old threshold this was the case that tagged half the
    // product.
    expect(
      fitOf(choice('structure', 'heavy', 'new'), { load: 'medium', character: 'attack' }, improving)
        .style
    ).toBe('neutral');
  });

  // levelFit returns 0 for a level id it does not recognise — a data fault, not
  // a judgement. The page must stay QUIET about it rather than stamping "costs
  // you a year first" on an opening whose level it simply failed to read: a
  // corrupt field would become a confident warning, and the warning would look
  // exactly like a real one.
  it('makes no level claim about a choice whose level it cannot read', () => {
    const corrupt = { load: 'light' as TheoryLoad, character: 'attack' as Character, level: 'not-a-band' as never };
    const fit = fitOf(corrupt, { load: 'light', character: 'attack' }, improving);
    expect(fit.level).toBe('neutral');
    expect(fit.recommended).toBe(false);
    // The style axis is unaffected: character is read directly, not via a band.
    expect(fit.style).toBe('match');
  });

  it('one band above is neither a stretch nor a recommendation', () => {
    // levelFit returns 1 for a single band up — deliberately not a warning, and
    // deliberately not an endorsement either.
    const oneUp = choice('attack', 'light', 'improving');
    const fit = fitOf(oneUp, { load: 'light', character: 'attack' }, bandFor(900));
    expect(fit.level).toBe('neutral');
    expect(fit.recommended).toBe(false);
    expect(fit.style).toBe('match');
  });
});

describe('CHARACTER_STYLE', () => {
  it('covers every character with a distinct colour', () => {
    const colours = CHARACTERS.map(c => CHARACTER_STYLE[c].colour);
    expect(colours).toHaveLength(4);
    expect(new Set(colours).size).toBe(4);
  });

  it('borrows neither the brand ember nor the good-green', () => {
    // Those two already mean "look here" and "this is fine". A character
    // wearing either would be making a recommendation it cannot back.
    const reserved = ['#FB923C', '#F97316', '#86EFAC'];
    for (const c of CHARACTERS) {
      expect(reserved).not.toContain(CHARACTER_STYLE[c].colour.toUpperCase());
    }
  });
});

describe('rarity', () => {
  // ── Zero by definition ───────────────────────────────────────────────────
  // A line you meet all the time has no rarity to report. The threshold itself
  // must come back null, not "1 game in 20" — a boundary that leaks is how a
  // tag ends up on every row and stops meaning anything.
  it('says nothing at or above the threshold', () => {
    expect(rarity(RARE_BELOW)).toBeNull();
    expect(rarity(0.3)).toBeNull();
    expect(rarity(1)).toBeNull();
  });

  it('says nothing for a share that is absent or impossible', () => {
    expect(rarity(0)).toBeNull();
    expect(rarity(-0.1)).toBeNull();
    expect(rarity(Number.NaN)).toBeNull();
    expect(rarity(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('turns a small percentage into a number of games', () => {
    expect(rarity(0.04)).toBe('1 game in 25');
    expect(rarity(0.02)).toBe('1 game in 50');
  });

  it('rounds away precision the corpus cannot support', () => {
    // 1/0.016 is 62.5. Reporting "1 game in 63" invites arithmetic the shares
    // are not accurate enough to bear.
    expect(rarity(0.016)).toBe('1 game in 65');
  });

  it('floors out rather than inventing a denominator', () => {
    expect(rarity(0.004)).toBe('1 game in 200+');
    expect(rarity(0.00001)).toBe('1 game in 200+');
  });

  it('is monotone: rarer never reads as more common', () => {
    const shares = [0.049, 0.04, 0.03, 0.02, 0.01, 0.006];
    const denominators = shares.map(s => Number(String(rarity(s)).replace(/\D/g, '')));
    for (let i = 1; i < denominators.length; i++) {
      expect(denominators[i]).toBeGreaterThanOrEqual(denominators[i - 1]);
    }
  });
});

describe('the bands this is rendered against', () => {
  it('still has five, so levelFit stretches mean what these tests assume', () => {
    expect(BANDS.map(b => b.id)).toEqual(['new', 'beginner', 'improving', 'club', 'strong']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The guard that would have caught the wallpaper fault on its own.
//
// The first threshold looked reasonable in isolation and was only exposed by
// looking at a screenshot: five of the eight suggestions against 1.d4 carrying
// "doesn't fit your playstyle". This runs the same check the eye did, over the
// SHIPPED map rather than a fixture, across every quiz answer a player can
// give — so the next time somebody tunes the threshold, the thing that goes red
// is a test rather than a page.
// ─────────────────────────────────────────────────────────────────────────────
import map from '@/data/repertoire-map.json';
import type { RepertoireMap } from '@/types/repertoire';

const LOADS: TheoryLoad[] = ['light', 'medium', 'heavy'];

describe('the complaint rate over the real map', () => {
  const slots = (map as unknown as RepertoireMap).slots.filter(s => s.choices.length >= 3);

  it('has slots to measure, so this cannot pass vacuously', () => {
    expect(slots.length).toBeGreaterThan(0);
  });

  it('never objects to EVERY option a player is offered', () => {
    const wiped: string[] = [];
    for (const load of LOADS) {
      for (const character of CHARACTERS) {
        for (const slot of slots) {
          const poor = slot.choices.filter(
            c => fitOf(c, { load, character }, improving).style === 'poor'
          ).length;
          if (poor === slot.choices.length) {
            wiped.push(`${slot.id} for ${load}/${character} (${poor}/${slot.choices.length})`);
          }
        }
      }
    }
    // A page that objects to every available option is not advising anybody.
    expect(wiped).toEqual([]);
  });

  it('keeps the complaint a minority of the whole product', () => {
    let poor = 0;
    let total = 0;
    for (const load of LOADS) {
      for (const character of CHARACTERS) {
        for (const slot of slots) {
          for (const c of slot.choices) {
            total += 1;
            if (fitOf(c, { load, character }, improving).style === 'poor') poor += 1;
          }
        }
      }
    }
    expect(total).toBeGreaterThan(100);
    // Measured at 12% on the map as shipped. A third is a generous ceiling —
    // past that the tag is describing the catalogue, not the player.
    expect(poor / total).toBeLessThan(0.33);
  });

  it('still fires somewhere, or the tag is dead code', () => {
    // The control for the two bounds above: they would both pass if `poor`
    // were never produced at all, which is the other way to get this wrong.
    const anyPoor = LOADS.some(load =>
      CHARACTERS.some(character =>
        slots.some(slot =>
          slot.choices.some(c => fitOf(c, { load, character }, improving).style === 'poor')
        )
      )
    );
    expect(anyPoor).toBe(true);
  });
});

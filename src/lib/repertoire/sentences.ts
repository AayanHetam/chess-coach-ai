// What a choice actually covers, said in a sentence.
//
// The number is already on the page as `choice.absorbs`, and as a number it does
// not land: "answers 87%" next to "answers 100%" reads as two similar options
// when one of them finishes the job and the other leaves you with homework.
//
// So it is said the way it would be said out loud:
//
//   "The Caro-Kann answers everything after 1.e4."
//   "The Grünfeld answers 70% of 1.d4. You still need something against the
//    London."
//
// Every number here is measured — `absorbs` is set membership over the family's
// real lines, and the gaps are the branches it leaves. Nothing is written by a
// model and nothing is rounded in our favour.

import { share } from '@/lib/repertoire/bracket';
import type { RepertoireChoice, RepertoireSlot } from '@/types/repertoire';

/** What the slot is an answer TO, in words a player would use. */
export function facing(slot: Pick<RepertoireSlot, 'line' | 'name'>): string {
  if (slot.name) {
    // "the Sicilian Defense" reads; "the 1.e4" does not, and neither does "the
    // The London System". Only an opening NAME takes the article.
    const bare = /^(the\s|\d)/i.test(slot.name);
    return bare ? slot.name : `the ${slot.name}`;
  }
  if (slot.line.length === 0) return 'your first move';
  const numbered: string[] = [];
  for (let i = 0; i < slot.line.length; i += 2) {
    const n = i / 2 + 1;
    numbered.push(slot.line[i + 1] ? `${n}.${slot.line[i]} ${slot.line[i + 1]}` : `${n}.${slot.line[i]}`);
  }
  return numbered.join(' ');
}

/**
 * How complete a choice is, as a sentence.
 *
 * `coverage: 'move'` is deliberately excluded from the percentage: 1.e4
 * "answers 3%" is arithmetically true and useless, because the move was never a
 * claim to answer anything. `types/repertoire.ts` says so on the field itself.
 */
export function coverageSentence(
  choice: Pick<RepertoireChoice, 'name' | 'coverage' | 'absorbs' | 'gaps'>,
  slot: Pick<RepertoireSlot, 'line' | 'name'>
): string {
  const against = facing(slot);

  if (choice.coverage === 'move') {
    const n = choice.gaps.length;
    if (n === 0) return `${choice.name} commits you to a move and nothing else.`;
    return `${choice.name} is a first move, not an answer. It leaves ${n} decision${n === 1 ? '' : 's'} still to make.`;
  }

  if (choice.coverage === 'system') {
    return `${choice.name} is one setup you play whatever they do, so there is nothing left to decide against ${against}.`;
  }

  // A family whose gaps are all below the threshold really does answer the slot.
  if (choice.gaps.length === 0) {
    return `${choice.name} answers everything after ${against}.`;
  }

  const biggest = [...choice.gaps].sort((a, b) => b.share - a.share)[0];
  const rest = choice.gaps.length - 1;
  const tail =
    rest > 0
      ? ` The rest of it is ${rest} smaller branch${rest === 1 ? '' : 'es'}.`
      : '';
  return (
    `${choice.name} answers ${share(choice.absorbs)} of ${against}. ` +
    `You still need something for the other ${share(1 - choice.absorbs)}, ` +
    `mostly ${gapName(biggest)}.${tail}`
  );
}

/** A gap slot named the way a player would say it. */
function gapName(gap: { slot: string; share: number }): string {
  // Slot ids are "side:san san san". The moves are what a player recognises;
  // the side is already implied by the page they are looking at.
  const line = gap.slot.split(':')[1] ?? '';
  const moves = line.split(' ').filter(Boolean);
  if (moves.length === 0) return 'the first move';
  const numbered: string[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const n = i / 2 + 1;
    numbered.push(moves[i + 1] ? `${n}.${moves[i]} ${moves[i + 1]}` : `${n}.${moves[i]}`);
  }
  return numbered.join(' ');
}

/**
 * The one line under a slot that has no answer yet.
 *
 * Frequency first, because "you will meet this 37% of the time" is the reason to
 * care and the name is only how to look it up.
 */
export function unfilledSentence(slot: Pick<RepertoireSlot, 'share' | 'line' | 'name'>): string {
  return `${share(slot.share)} of games. Nothing chosen for ${facing(slot)} yet.`;
}

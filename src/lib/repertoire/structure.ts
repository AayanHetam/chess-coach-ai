// Naming the pawn structure a position turns into.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS
//
// No book has an article about 1.c4 e6 2.Nc3 d5. It is 14% of what an English
// player faces and it is a POSITION, not an opening, so no prose corpus will
// ever name it — Wikibooks does not, Wikipedia does not, and neither does any
// course. Measured against our own bracket, 35% of the slots a complete
// repertoire has to fill have no expert word written about them anywhere.
//
// But strong players do not see that position as nameless. They see where it
// goes: 3.d4 Nf6 4.cxd5 exd5 5.Bg5 c6 leaves White with a2 b2 d4 e3 f2 g2 h2
// and Black with a7 b7 c6 d5 f7 g7 h7, which is the Carlsbad — a Queen's Gambit
// Declined Exchange reached by a flank move order, minority attack and all.
//
// A pawn skeleton is exactly computable and the set of structures worth naming
// is small and closed. So this is understanding we can DERIVE for every
// position, including the ones nobody has written a word about.
//
// What is derived and what is written:
//
//   DERIVED   the skeleton, which structure it is, and (in the build script)
//             which breaks actually occur and where the kings actually go
//   WRITTEN   the one-line description of each structure below
//
// The written part describes a STRUCTURE, not a position. There are twelve of
// them, they are textbook, and they are in one table so they can be read and
// corrected in one sitting. Nothing here is generated, and no model writes any
// of it.
// ─────────────────────────────────────────────────────────────────────────────

export interface Skeleton {
  /** White pawn squares, e.g. `["a2", "d4", "e3"]`. */
  white: string[];
  /** Black pawn squares. */
  black: string[];
}

const FILES = 'abcdefgh';

/** Pawns only. Everything else is noise for this question. */
export function skeletonOf(fen: string): Skeleton {
  const white: string[] = [];
  const black: string[] = [];
  const rows = fen.split(' ')[0].split('/');
  if (rows.length !== 8) return { white, black };
  rows.forEach((row, rankIndex) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      if (file < 8) {
        const square = `${FILES[file]}${8 - rankIndex}`;
        if (ch === 'P') white.push(square);
        if (ch === 'p') black.push(square);
      }
      file += 1;
    }
  });
  return { white, black };
}

/** Files a side still has a pawn on. */
export function filesOf(pawns: string[]): Set<string> {
  return new Set(pawns.map(p => p[0]));
}

export interface Structure {
  id: string;
  name: string;
  /** One line. Describes the STRUCTURE, not the position that reached it. */
  summary: string;
  /** What each side is trying to do in it. */
  white: string;
  black: string;
}

type Rule = Structure & { test: (sk: Skeleton, w: Set<string>, b: Set<string>) => boolean };

const has = (pawns: string[], square: string) => pawns.includes(square);

/**
 * Ordered most specific first. The first match wins, so a Carlsbad is never
 * reported as the Slav triangle it partly resembles.
 *
 * A position that matches nothing returns null. That is a real answer and the
 * common one: most opening positions are still symmetrical or still fluid, and
 * forcing every one of them into a named structure would put a confident label
 * on a position that does not have one yet.
 */
const RULES: Rule[] = [
  {
    id: 'carlsbad',
    name: 'Carlsbad',
    summary:
      'White has traded the c-pawn for Black\'s e-pawn, leaving White a half-open c-file and Black a half-open e-file.',
    white: 'The minority attack: b4-b5 to hit c6 and leave Black with a weak pawn.',
    black: 'Play on the kingside, or ...Ne4 and ...f5 before White\'s queenside gets going.',
    test: (sk, w, b) =>
      !w.has('c') && has(sk.white, 'd4') && !b.has('e') && has(sk.black, 'c6') && has(sk.black, 'd5'),
  },
  {
    id: 'iqp-white',
    name: 'Isolated queen\'s pawn, White',
    summary: 'White has a d-pawn with no c- or e-pawn beside it. Space and open lines against a long-term weakness.',
    white: 'Piece play while the pawn still cramps them: the d5 push, and the outpost on e5.',
    black: 'Trade pieces. In an endgame the pawn is simply weak.',
    // The opponent must have no d-pawn. Two isolated d-pawns facing each other
    // are BLOCKED, not isolated: neither can advance and neither file is open,
    // which is the opposite of the position the plans below describe.
    test: (sk, w, b) => has(sk.white, 'd4') && !w.has('c') && !w.has('e') && !b.has('d'),
  },
  {
    id: 'iqp-black',
    name: 'Isolated queen\'s pawn, Black',
    summary: 'Black has a d-pawn with no c- or e-pawn beside it. The same bargain with the colours reversed.',
    white: 'Blockade on d4, trade pieces, and win the pawn late.',
    black: 'Active piece play and the ...d4 break, before the endgame arrives.',
    test: (sk, w, b) => has(sk.black, 'd5') && !b.has('c') && !b.has('e') && !w.has('d'),
  },
  {
    id: 'hanging-white',
    name: 'Hanging pawns, White',
    summary: 'White pawns abreast on c4 and d4 with no b- or e-pawn. Strong while they advance, weak once they stop.',
    white: 'Push one of them, usually d5, before Black gets to blockade both.',
    black: 'Fix them, then attack them. They cannot both be defended by pawns.',
    test: (sk, w) => has(sk.white, 'c4') && has(sk.white, 'd4') && !w.has('b') && !w.has('e'),
  },
  {
    id: 'maroczy',
    name: 'Maróczy bind',
    summary: 'White pawns on c4 and e4 against a Black side with no c-pawn. A space bind rather than an attack.',
    white: 'Squeeze. Keep pieces on, own d5, and deny Black the ...b5 and ...d5 breaks.',
    black: 'Fight for a break: ...b5 or ...d5, usually after trading a pair of minor pieces.',
    test: (sk, w, b) => has(sk.white, 'c4') && has(sk.white, 'e4') && !w.has('d') && !b.has('c'),
  },
  {
    id: 'boleslavsky',
    name: 'Boleslavsky hole',
    summary: 'Black has pawns on d6 and e5 and no c-pawn, which leaves the d5 square permanently short of a defender.',
    white: 'Occupy d5, or trade the pieces that fight for it.',
    black: 'Accept the hole for the activity: the e5 pawn takes squares and the play is fast.',
    test: (sk, w, b) => !b.has('c') && has(sk.black, 'd6') && has(sk.black, 'e5') && w.has('e'),
  },
  {
    id: 'scheveningen',
    name: 'Scheveningen small centre',
    summary: 'Black pawns on d6 and e6 and no c-pawn: a low, flexible centre that concedes space and keeps every break.',
    white: 'Space and a kingside attack, often with f4 and g4.',
    black: 'Hold the small centre, then hit back with ...d5 or ...b5.',
    test: (sk, w, b) => !b.has('c') && has(sk.black, 'd6') && has(sk.black, 'e6') && w.has('e'),
  },
  {
    id: 'open-sicilian',
    name: 'Open Sicilian',
    summary:
      'Black has traded the c-pawn for White\'s d-pawn: a half-open c-file and a queenside majority against White\'s space and half-open d-file.',
    white: 'Play in the centre and at the king, and use d5.',
    black: 'The c-file, the ...b5 break, and the extra central pawn in an endgame.',
    // Deliberately AFTER the Maróczy, Boleslavsky and Scheveningen rules, all
    // of which are this structure with a further feature worth naming.
    test: (sk, w, b) => w.has('e') && !w.has('d') && has(sk.black, 'd6') && !b.has('c'),
  },
  {
    id: 'french-chain',
    name: 'Locked centre, French type',
    summary: 'White e5 and d4 against Black e6 and d5. The centre is closed and both sides play on the wing their chain points at.',
    white: 'Kingside space, and defend the base of the chain on d4.',
    black: 'Attack the base of the chain with ...c5 and ...f6.',
    test: (sk) =>
      has(sk.white, 'e5') && has(sk.white, 'd4') && has(sk.black, 'e6') && has(sk.black, 'd5'),
  },
  {
    id: 'kid-chain',
    name: 'King\'s Indian chain',
    summary: 'White d5, c4 and e4 against Black d6 and e5. The centre is shut and the game becomes a race on opposite wings.',
    white: 'The c5 break and play down the c-file.',
    black: '...f5 and everything that follows it at White\'s king.',
    test: (sk) =>
      has(sk.white, 'd5') && has(sk.white, 'c4') && has(sk.white, 'e4') && has(sk.black, 'd6') && has(sk.black, 'e5'),
  },
  {
    id: 'benoni-chain',
    name: 'Benoni chain',
    summary: 'White d5 and c4 against Black c5 and d6, with Black a half-open e-file and a queenside pawn majority.',
    white: 'Central space and the e4-e5 break.',
    black: 'The ...b5 break and pressure down the long diagonal.',
    test: (sk, w, b) =>
      has(sk.white, 'd5') && has(sk.white, 'c4') && has(sk.black, 'c5') && has(sk.black, 'd6'),
  },
  {
    id: 'stonewall-black',
    name: 'Stonewall, Black',
    summary: 'Black pawns on d5, e6 and f5. A permanent grip on e4 bought with a permanently weak e5 square.',
    white: 'Trade the dark-squared bishops and use e5.',
    black: 'Own e4, and attack on the kingside.',
    test: (sk) => has(sk.black, 'd5') && has(sk.black, 'e6') && has(sk.black, 'f5'),
  },
  {
    id: 'stonewall-white',
    name: 'Stonewall, White',
    summary: 'White pawns on d4, e3 and f4. The same grip on e5, and the same hole on e4.',
    white: 'Own e5, and attack on the kingside.',
    black: 'Trade the dark-squared bishops and use e4.',
    test: (sk) => has(sk.white, 'd4') && has(sk.white, 'e3') && has(sk.white, 'f4'),
  },
  {
    id: 'slav-triangle',
    name: 'Slav triangle',
    summary: 'Black pawns on c6, d5 and e6. Extremely solid, and the light-squared bishop has to be solved.',
    white: 'Play for the e4 break and against the bishop still on c8.',
    black: 'Get the bishop out, or trade it, then equalise with ...c5 or ...dxc4 and ...b5.',
    test: (sk) => has(sk.black, 'c6') && has(sk.black, 'd5') && has(sk.black, 'e6'),
  },
];

/** The structure this skeleton is, or null when it is not one of them yet. */
export function classify(sk: Skeleton): Structure | null {
  const w = filesOf(sk.white);
  const b = filesOf(sk.black);
  for (const rule of RULES) {
    if (rule.test(sk, w, b)) {
      const { test: _test, ...structure } = rule;
      return structure;
    }
  }
  return null;
}

/** True when both sides hold pawns on exactly the same files. */
export function isSymmetrical(sk: Skeleton): boolean {
  const w = Array.from(filesOf(sk.white)).sort().join('');
  const b = Array.from(filesOf(sk.black)).sort().join('');
  return w === b;
}

export const STRUCTURES: Structure[] = RULES.map(({ test: _test, ...rest }) => rest);

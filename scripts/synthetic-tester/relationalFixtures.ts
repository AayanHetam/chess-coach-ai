/**
 * Relational-hallucination baseline fixtures (Phase 0).
 *
 * Short, sharp, tactical lines. Kept short on purpose: the flagship route does a
 * move-by-move review, so a short game keeps the coach's commentary anchored to
 * the final (scored) position with minimal cross-position noise. Each line ends
 * at a position with capture/attack/defense tension — exactly where a model is
 * tempted to assert a relationship that isn't on the board.
 *
 * Every fixture is validated for legality by __tests__/relationalFixtures.test.ts
 * (chess.js must parse the PGN and reach a legal position). Do not add a fixture
 * without the test passing.
 */
export interface RelationalFixture {
  id: string;
  label: string;
  /** bare SAN movetext (no headers) */
  pgn: string;
  /** why this position tempts a relational hallucination */
  note: string;
}

export const RELATIONAL_FIXTURES: RelationalFixture[] = [
  {
    id: "fried-liver",
    label: "Fried Liver Attack — knight sac, king hunt",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3",
    note: "Black king on e6 amid white attackers; lots of (mis)attributable attack/defense relations.",
  },
  {
    id: "traxler",
    label: "Traxler Counterattack — mutual sacrifices",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 Bc5 5. Nxf7 Bxf2+ 6. Kxf2 Nxe4+ 7. Kg1 Qh4",
    note: "Both kings exposed, knight on e4 and queen on h4; tempts invented forks/threats.",
  },
  {
    id: "evans-gambit",
    label: "Evans Gambit — central tension on f7",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O dxc3 8. Qb3",
    note: "Bc4+Qb3 battery eyeing f7; tempts overstated capture/threat on f7.",
  },
  {
    id: "scotch-gambit",
    label: "Scotch Gambit — open lines",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Bc4 Bc5 5. c3 Nf6 6. e5 d5 7. exf6 dxc4 8. fxg7",
    note: "Pawn on g7, open center; tempts invented attacks against the black king/rook.",
  },
  {
    id: "najdorf",
    label: "Sicilian Najdorf — rich middlegame",
    pgn: "1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 7. f4 Be7 8. Qf3 Qc7",
    note: "Dense piece interplay (Bg5 pin, f4 break); fertile ground for false attack/defense claims.",
  },
  {
    id: "french-winawer",
    label: "French Winawer — poisoned kingside",
    pgn: "1. e4 e6 2. d4 d5 3. Nc3 Bb4 4. e5 c5 5. a3 Bxc3+ 6. bxc3 Ne7 7. Qg4 Qc7 8. Qxg7 Rg8 9. Qxh7",
    note: "White queen raids h7/g7; tempts wrong claims about which pieces the queen attacks.",
  },
  {
    id: "qgd-tartakower",
    label: "Queen's Gambit Declined — central pieces",
    pgn: "1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. cxd5 Nxd5",
    note: "Bh4 long diagonal vs Nd5; classic spot to misread pins/attacks.",
  },
  {
    id: "kings-indian",
    label: "King's Indian — opposite-wing tension",
    pgn: "1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6 8. d5 Ne7",
    note: "Locked center, fianchetto bishop; tempts invented long-diagonal attacks.",
  },
  {
    id: "ruy-lopez",
    label: "Ruy Lopez — classical tension on e5/e4",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O",
    note: "Bb3 battery toward f7, Re1 behind e-pawn; tempts overstated central threats.",
  },
  {
    id: "caro-kann",
    label: "Caro-Kann — knight maneuvers",
    pgn: "1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7 8. h5 Bh7",
    note: "Bishop shuffled to h7, knights hopping; tempts wrong attacker/defender attributions.",
  },
  {
    id: "englund-trap",
    label: "Englund Gambit trap — Qc1#",
    pgn: "1. d4 e5 2. dxe5 Nc6 3. Nf3 Qe7 4. Bf4 Qb4+ 5. Bd2 Qxb2 6. Bc3 Bb4 7. Qd2 Bxc3 8. Qxc3 Qc1#",
    note: "Forced mate; the coach should state the exact mating relation, easy to get subtly wrong.",
  },
  {
    id: "legal-trap",
    label: "Légal's Mate",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 d6 4. Nc3 Bg4 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#",
    note: "Queen sac then minor-piece mate; tempts misattributing which piece delivers/guards mate.",
  },
  {
    id: "blackburne-shilling",
    label: "Blackburne Shilling Gambit trap",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#",
    note: "Knight mate with queen support; tempts wrong claims about defenders of f3/e2.",
  },
  {
    id: "italian-fork",
    label: "Italian — central fork tension",
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O",
    note: "Ne4 hanging-looking but supported; classic 'is it really hanging' relational test.",
  },
  {
    id: "danish-gambit",
    label: "Danish Gambit — two bishops on the long diagonals",
    pgn: "1. e4 e5 2. d4 exd4 3. c3 dxc3 4. Bc4 cxb2 5. Bxb2 d5 6. Bxd5 Nf6 7. Bxf7+ Kxf7 8. Qxd8",
    note: "Bishops raking toward the black king; tempts overstated/!misdirected attack claims.",
  },
  {
    id: "budapest-trap",
    label: "Budapest Gambit — Rubinstein trap",
    pgn: "1. d4 Nf6 2. c4 e5 3. dxe5 Ng4 4. Bf4 Nc6 5. Nf3 Bb4+ 6. Nbd2 Qe7 7. a3 Ngxe5 8. axb4 Nd3#",
    note: "Smothered-style mate on d3; tempts wrong claims about which pieces cover d3/e5.",
  },
];

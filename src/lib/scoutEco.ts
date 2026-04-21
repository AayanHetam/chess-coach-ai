// Compact ECO lookup — maps a SAN-move prefix (space-joined) to { eco, name }.
// We intentionally keep this small & hand-curated rather than shipping the full
// ~10k-entry ECO table; the Scout UI only needs a recognizable label for the
// most common lines that show up in player weaknesses / strengths.

type EcoEntry = { eco: string; name: string };

const ECO_PREFIXES: Record<string, EcoEntry> = {
  // ── 1.e4 ─────────────────────────────────────────────────────────────────
  'e4': { eco: 'B00', name: "King's Pawn Opening" },

  // Sicilian
  'e4 c5': { eco: 'B20', name: 'Sicilian Defense' },
  'e4 c5 Nf3': { eco: 'B27', name: 'Sicilian Defense' },
  'e4 c5 Nf3 d6': { eco: 'B50', name: 'Sicilian Defense' },
  'e4 c5 Nf3 Nc6': { eco: 'B30', name: 'Sicilian, Old Sicilian' },
  'e4 c5 Nf3 e6': { eco: 'B40', name: 'Sicilian Defense' },
  'e4 c5 Nf3 d6 d4': { eco: 'B52', name: 'Sicilian, Open' },
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6': { eco: 'B55', name: 'Sicilian Defense' },
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3': { eco: 'B56', name: 'Sicilian, Classical' },
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6': { eco: 'B90', name: 'Sicilian, Najdorf' },
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6': { eco: 'B70', name: 'Sicilian, Dragon' },
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6': { eco: 'B56', name: 'Sicilian, Classical' },
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6': { eco: 'B80', name: 'Sicilian, Scheveningen' },
  'e4 c5 Nf3 Nc6 d4': { eco: 'B32', name: 'Sicilian, Open' },
  'e4 c5 Nf3 e6 d4': { eco: 'B40', name: 'Sicilian, Taimanov' },
  'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6': { eco: 'B44', name: 'Sicilian, Taimanov' },
  'e4 c5 Nc3': { eco: 'B23', name: 'Sicilian, Closed' },
  'e4 c5 c3': { eco: 'B22', name: 'Sicilian, Alapin' },
  'e4 c5 f4': { eco: 'B21', name: 'Sicilian, Grand Prix' },
  'e4 c5 Bb5': { eco: 'B51', name: 'Sicilian, Rossolimo' },
  'e4 c5 Nf3 Nc6 Bb5': { eco: 'B30', name: 'Sicilian, Rossolimo' },

  // Caro-Kann
  'e4 c6': { eco: 'B10', name: 'Caro-Kann Defense' },
  'e4 c6 Nc3': { eco: 'B10', name: 'Caro-Kann, Two Knights' },
  'e4 c6 d4': { eco: 'B12', name: 'Caro-Kann Defense' },
  'e4 c6 d4 d5': { eco: 'B12', name: 'Caro-Kann Defense' },
  'e4 c6 d4 d5 Nc3': { eco: 'B15', name: 'Caro-Kann, Main Line' },
  'e4 c6 d4 d5 Nc3 dxe4': { eco: 'B15', name: 'Caro-Kann, Main Line' },
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5': { eco: 'B19', name: 'Caro-Kann, Classical' },
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6': { eco: 'B15', name: 'Caro-Kann, Main Line 4...Nf6' },
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7': { eco: 'B17', name: 'Caro-Kann, Karpov' },
  'e4 c6 d4 d5 exd5': { eco: 'B13', name: 'Caro-Kann, Exchange' },
  'e4 c6 d4 d5 exd5 cxd5': { eco: 'B13', name: 'Caro-Kann, Exchange' },
  'e4 c6 d4 d5 exd5 cxd5 c4': { eco: 'B13', name: 'Caro-Kann, Panov Attack' },
  'e4 c6 d4 d5 e5': { eco: 'B12', name: 'Caro-Kann, Advance' },

  // French
  'e4 e6': { eco: 'C00', name: 'French Defense' },
  'e4 e6 d4': { eco: 'C01', name: 'French Defense' },
  'e4 e6 d4 d5': { eco: 'C01', name: 'French Defense' },
  'e4 e6 d4 d5 Nc3': { eco: 'C10', name: 'French, Paulsen' },
  'e4 e6 d4 d5 Nc3 Bb4': { eco: 'C15', name: 'French, Winawer' },
  'e4 e6 d4 d5 Nc3 Nf6': { eco: 'C11', name: 'French, Classical' },
  'e4 e6 d4 d5 Nd2': { eco: 'C03', name: 'French, Tarrasch' },
  'e4 e6 d4 d5 exd5': { eco: 'C01', name: 'French, Exchange' },
  'e4 e6 d4 d5 e5': { eco: 'C02', name: 'French, Advance' },

  // King's Pawn games
  'e4 e5': { eco: 'C20', name: "King's Pawn Game" },
  'e4 e5 Nf3': { eco: 'C40', name: "King's Knight Opening" },
  'e4 e5 Nf3 d6': { eco: 'C41', name: 'Philidor Defense' },
  'e4 e5 Nf3 Nf6': { eco: 'C42', name: 'Petrov Defense' },
  'e4 e5 Nf3 Nc6': { eco: 'C44', name: "King's Pawn Game" },
  'e4 e5 Nf3 Nc6 Bb5': { eco: 'C60', name: 'Ruy Lopez' },
  'e4 e5 Nf3 Nc6 Bb5 a6': { eco: 'C70', name: 'Ruy Lopez, Morphy' },
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4': { eco: 'C70', name: 'Ruy Lopez, Morphy' },
  'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6': { eco: 'C78', name: 'Ruy Lopez, Closed' },
  'e4 e5 Nf3 Nc6 Bb5 Nf6': { eco: 'C65', name: 'Ruy Lopez, Berlin' },
  'e4 e5 Nf3 Nc6 Bc4': { eco: 'C50', name: 'Italian Game' },
  'e4 e5 Nf3 Nc6 Bc4 Bc5': { eco: 'C50', name: 'Italian, Giuoco Piano' },
  'e4 e5 Nf3 Nc6 Bc4 Nf6': { eco: 'C55', name: 'Italian, Two Knights' },
  'e4 e5 Nf3 Nc6 d4': { eco: 'C44', name: 'Scotch Game' },
  'e4 e5 Nf3 Nc6 Nc3': { eco: 'C46', name: 'Three Knights Opening' },
  'e4 e5 Nf3 Nc6 Nc3 Nf6': { eco: 'C47', name: 'Four Knights Game' },
  'e4 e5 Nc3': { eco: 'C25', name: 'Vienna Game' },
  'e4 e5 Nc3 Nf6': { eco: 'C26', name: 'Vienna Game' },
  'e4 e5 Nc3 Nc6': { eco: 'C25', name: 'Vienna Game' },
  'e4 e5 Bc4': { eco: 'C23', name: 'Bishop Opening' },
  'e4 e5 f4': { eco: 'C30', name: "King's Gambit" },

  // Scandinavian & odd 1…
  'e4 d5': { eco: 'B01', name: 'Scandinavian Defense' },
  'e4 d5 exd5': { eco: 'B01', name: 'Scandinavian Defense' },
  'e4 d6': { eco: 'B07', name: 'Pirc Defense' },
  'e4 d6 d4 Nf6': { eco: 'B07', name: 'Pirc Defense' },
  'e4 Nf6': { eco: 'B02', name: 'Alekhine Defense' },
  'e4 g6': { eco: 'B06', name: 'Modern Defense' },
  'e4 Nc6': { eco: 'B00', name: 'Nimzowitsch Defense' },
  'e4 b6': { eco: 'B00', name: 'Owen Defense' },

  // ── 1.d4 ─────────────────────────────────────────────────────────────────
  'd4': { eco: 'A40', name: "Queen's Pawn Opening" },
  'd4 d5': { eco: 'D00', name: "Queen's Pawn Game" },
  'd4 d5 c4': { eco: 'D06', name: "Queen's Gambit" },
  'd4 d5 c4 e6': { eco: 'D30', name: "Queen's Gambit Declined" },
  'd4 d5 c4 e6 Nc3': { eco: 'D31', name: "QGD, Classical" },
  'd4 d5 c4 e6 Nc3 Nf6': { eco: 'D35', name: "QGD, Exchange" },
  'd4 d5 c4 c6': { eco: 'D10', name: 'Slav Defense' },
  'd4 d5 c4 c6 Nc3': { eco: 'D15', name: 'Slav Defense' },
  'd4 d5 c4 c6 Nf3': { eco: 'D11', name: 'Slav Defense' },
  'd4 d5 c4 dxc4': { eco: 'D20', name: "Queen's Gambit Accepted" },
  'd4 d5 c4 Nf6': { eco: 'D07', name: "QG, Chigorin" },
  'd4 d5 Nf3': { eco: 'D02', name: "Queen's Pawn Game" },
  'd4 d5 Bf4': { eco: 'D00', name: 'London System' },
  'd4 d5 Nf3 Nf6 Bf4': { eco: 'D02', name: 'London System' },
  'd4 d5 Nf3 Nf6 c4 e6 Nc3': { eco: 'D37', name: "QGD, 5.Bf4" },

  // Indian defenses
  'd4 Nf6': { eco: 'A45', name: 'Indian Game' },
  'd4 Nf6 c4': { eco: 'E00', name: 'Indian Game' },
  'd4 Nf6 c4 e6': { eco: 'E01', name: 'Indian Game' },
  'd4 Nf6 c4 e6 Nc3': { eco: 'E10', name: 'Indian Game' },
  'd4 Nf6 c4 e6 Nc3 Bb4': { eco: 'E20', name: 'Nimzo-Indian Defense' },
  'd4 Nf6 c4 e6 Nf3': { eco: 'E10', name: 'Indian, Blumenfeld' },
  'd4 Nf6 c4 e6 Nf3 b6': { eco: 'E12', name: 'Queen\'s Indian Defense' },
  'd4 Nf6 c4 g6': { eco: 'E60', name: "King's Indian Defense" },
  'd4 Nf6 c4 g6 Nc3': { eco: 'E70', name: "King's Indian Defense" },
  'd4 Nf6 c4 g6 Nc3 Bg7': { eco: 'E90', name: "King's Indian Classical" },
  'd4 Nf6 c4 g6 Nc3 d5': { eco: 'D80', name: 'Grünfeld Defense' },
  'd4 Nf6 c4 c5': { eco: 'A56', name: 'Benoni Defense' },
  'd4 Nf6 Nf3': { eco: 'A46', name: 'Indian Game' },
  'd4 Nf6 Bg5': { eco: 'A45', name: 'Trompowsky Attack' },
  'd4 Nf6 Bf4': { eco: 'A45', name: 'London System' },

  'd4 f5': { eco: 'A80', name: 'Dutch Defense' },
  'd4 g6': { eco: 'A40', name: 'Modern Defense' },
  'd4 e6': { eco: 'A40', name: 'Horwitz Defense' },
  'd4 c5': { eco: 'A43', name: 'Benoni Defense' },
  'd4 c6': { eco: 'D00', name: 'Slav-Like' },

  // ── Flank ────────────────────────────────────────────────────────────────
  'c4': { eco: 'A10', name: 'English Opening' },
  'c4 e5': { eco: 'A20', name: 'English, Reversed Sicilian' },
  'c4 c5': { eco: 'A30', name: 'English, Symmetrical' },
  'c4 Nf6': { eco: 'A15', name: 'English, Anglo-Indian' },
  'c4 e6': { eco: 'A10', name: 'English Opening' },
  'Nf3': { eco: 'A04', name: 'Réti Opening' },
  'Nf3 d5': { eco: 'A06', name: 'Réti Opening' },
  'Nf3 Nf6': { eco: 'A05', name: 'Réti Opening' },
  'b3': { eco: 'A01', name: 'Larsen Opening' },
  'g3': { eco: 'A00', name: 'Benko / Hungarian' },
  'f4': { eco: 'A02', name: "Bird's Opening" },
  'b4': { eco: 'A00', name: 'Sokolsky Opening' },
};

function formatPly(n: number, isWhite: boolean): string {
  const moveNumber = Math.floor(n / 2) + 1;
  return isWhite ? `${moveNumber}.` : `${moveNumber}...`;
}

/**
 * Resolves a move-sequence to the best-matching ECO entry plus a variation
 * label built from the moves past the matched prefix.
 */
export function getOpeningName(moves: string[]): {
  eco: string;
  name: string;
  variation: string;
} {
  if (moves.length === 0) {
    return { eco: '', name: 'Starting position', variation: '' };
  }

  let best: { depth: number; eco: string; name: string } | null = null;
  for (let depth = Math.min(moves.length, 12); depth >= 1; depth--) {
    const key = moves.slice(0, depth).join(' ');
    const hit = ECO_PREFIXES[key];
    if (hit) {
      best = { depth, ...hit };
      break;
    }
  }

  if (!best) {
    // Fallback: name from 1st move, variation from last move.
    const firstMove = moves[0];
    const tail = moves[moves.length - 1];
    const isWhite = (moves.length - 1) % 2 === 0;
    return {
      eco: 'A00',
      name: `${firstMove} Opening`,
      variation: moves.length > 1 ? `${formatPly(moves.length - 1, isWhite)} ${tail}` : '',
    };
  }

  // Build variation label from moves after the matched prefix.
  if (moves.length > best.depth) {
    const tailIdx = moves.length - 1;
    const tail = moves[tailIdx];
    const isWhite = tailIdx % 2 === 0;
    return {
      eco: best.eco,
      name: best.name,
      variation: `${formatPly(tailIdx, isWhite)} ${tail}`,
    };
  }

  return { eco: best.eco, name: best.name, variation: '' };
}

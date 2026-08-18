import { Chess, type Move } from "chess.js";

// ─── Coach move-reference parsing + green-link exploration helpers ───────
// Extracted from AnalysisImpl.tsx so the "click a recommended move →
// board loads that line" behavior is unit-testable (the repo's vitest
// setup is node-env, no jsdom — see InlinePuzzleCoach.test.tsx for the
// pattern). AnalysisImpl imports everything back from here.

// G7: production-parity 4-tier move-reference parser. Mirrors
// AICoachChat.tsx:1323-1353. Patterns ordered by specificity (longer +
// more anchored first) so overlapping matches are resolved in favor of
// the more specific one.
export const MOVE_REF_PATTERNS: Array<{
  re: RegExp;
  // Slot in match[] that holds (moveNumber, color?, san)
  numIdx: number;
  colorIdx?: number;
  sanIdx: number;
}> = [
  // Priority 1: AI parenthesized — "Move 3 (Nxd4)"
  {
    re: /Move\s+(\d+)\s*\([^)]*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)\)/gi,
    numIdx: 1,
    sanIdx: 2,
  },
  // Priority 2: "Move 3: Nxd4"
  {
    re: /Move\s+(\d+):\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
    numIdx: 1,
    sanIdx: 2,
  },
  // Priority 3: Standard "24.Rxd4" / "23...Nf6"
  {
    re: /(?<![A-Za-z0-9])(\d+)(\.{1,3})\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/g,
    numIdx: 1,
    colorIdx: 2, // 1-dot = white, 3-dot = black
    sanIdx: 3,
  },
  // Priority 4: "move 3 (w|b): Nxd4"
  {
    re: /move\s+(\d+)([wb])?:\s*([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](?:=[NBRQ])?[+#]?|O-O(?:-O)?[+#]?)/gi,
    numIdx: 1,
    colorIdx: 2,
    sanIdx: 3,
  },
];

// Recommended-move detector. Case-insensitive so "BEST MOVE:" uppercase
// headings (which the coach emits inside structured cards) match too.
// Expanded beyond production's set to cover the phrasings Aayan's smoke
// tests surfaced on 2026-05-29: "only winning move", "winning continuation",
// "best move:" with colon-anchored headings, etc.
export const RECOMMENDED_CONTEXT_RE =
  /best\s*(was|move|is|continuation|move\s*:)|should\s*have\s*(played|been)|instead\s*(of|,|:)|better\s*(was|move|is|alternative)|recommended|correct\s*move|improvement|only\s+(winning|good|playable|sensible)\s+move|winning\s+(move|continuation|line)|key\s+move/i;

export interface MoveRefMatch {
  start: number;
  end: number;
  full: string;
  moveNumber: number;
  isBlack: boolean;
  san: string;
  recommended: boolean;
}

export function findAllMoveRefs(
  text: string,
  forceRecommended = false
): MoveRefMatch[] {
  const matches: MoveRefMatch[] = [];
  for (const pat of MOVE_REF_PATTERNS) {
    const re = new RegExp(pat.re.source, pat.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const moveNumber = parseInt(m[pat.numIdx], 10);
      let isBlack = false;
      if (pat.colorIdx !== undefined) {
        const c = m[pat.colorIdx];
        // For priority 3 the slot holds dots ("." | ".." | "..."), so
        // length >= 3 means black. For priority 4 it's an explicit w|b.
        isBlack = c?.length === 3 || c === "b";
      }
      const san = m[pat.sanIdx];
      // Skip if a higher-priority match already covered this range.
      const overlaps = matches.some(
        (existing) =>
          m!.index < existing.end && m!.index + m![0].length > existing.start
      );
      if (overlaps) continue;
      const contextBefore = text
        .slice(Math.max(0, m.index - 60), m.index)
        .toLowerCase();
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        full: m[0],
        moveNumber,
        isBlack,
        san,
        recommended:
          forceRecommended || RECOMMENDED_CONTEXT_RE.test(contextBefore),
      });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

export const stripSanDecorators = (s: string) =>
  s.replace(/[+#!?]/g, "").toLowerCase();

// Resolve a "moveNumber.san" reference (e.g., 24.Rxd4) to the half-move ply
// it points at. Returns null if the game doesn't have that move at that
// position (within ±1 tolerance for off-by-one moveNumber typos in coach
// output).
export function findPlyForMoveRef(
  allMoves: Move[],
  moveNumber: number,
  isBlack: boolean,
  san: string
): number | null {
  const target = stripSanDecorators(san);
  const expectedPly = (moveNumber - 1) * 2 + (isBlack ? 2 : 1);
  const sanAt = (p: number) =>
    p >= 1 && p <= allMoves.length
      ? stripSanDecorators(allMoves[p - 1].san)
      : null;
  if (sanAt(expectedPly) === target) return expectedPly;
  for (const adj of [-1, 1, 2, -2]) {
    const p = expectedPly + adj;
    if (sanAt(p) === target) return p;
  }
  return null;
}

/** Half-move count of the position BEFORE `moveNumber` is played by the
 *  given color — i.e. the `currentPly` value at which that move would be
 *  the next move. White's move N sits after 2(N-1) half-moves, Black's
 *  after 2N-1. */
export function plyBeforeMove(moveNumber: number, isBlack: boolean): number {
  return Math.max(0, (moveNumber - 1) * 2 + (isBlack ? 1 : 0));
}

export interface RecommendedPreview {
  fen: string;
  from: string;
  to: string;
  san: string;
  /** Mainline half-move count the alternative branches FROM. */
  anchorPly: number;
}

/** Replay the game's mainline to `targetPly` half-moves, then play `san`
 *  on top — the "green link" exploration action. Coach output is often
 *  off by a move number (or attributes the move to the wrong color), so
 *  when `san` is illegal at `targetPly` the nearby plies are tried in the
 *  same ±1/±2 order production's ClickableMove used. Returns null when
 *  the move can't be played anywhere in that window. */
export function buildRecommendedPreview(
  allMoves: Array<Pick<Move, "san">>,
  targetPly: number,
  san: string,
  /** The game's starting FEN when it wasn't loaded from the standard
   *  position. Without it a FEN-loaded game replays from the wrong board and
   *  every recommendation is refused as illegal. */
  rootFen?: string
): RecommendedPreview | null {
  const tryAt = (ply: number): RecommendedPreview | null => {
    if (ply < 0 || ply > allMoves.length) return null;
    let g: Chess;
    try {
      g = rootFen ? new Chess(rootFen) : new Chess();
    } catch {
      g = new Chess();
    }
    try {
      for (let i = 0; i < ply; i++) g.move(allMoves[i].san);
    } catch {
      return null;
    }
    try {
      const played = g.move(san);
      return {
        fen: g.fen(),
        from: played.from,
        to: played.to,
        san: played.san,
        anchorPly: ply,
      };
    } catch {
      return null;
    }
  };
  for (const adj of [0, 1, -1, 2, -2]) {
    const res = tryAt(targetPly + adj);
    if (res) return res;
  }
  return null;
}

/** Play a SAN move on top of an arbitrary displayed FEN — the chained
 *  "continuation click" fallback (user already previewing a line, clicks
 *  the next move of the PV). Returns null when illegal. */
export function playSanOnFen(
  fen: string,
  san: string
): { fen: string; from: string; to: string; san: string } | null {
  try {
    const g = new Chess(fen);
    const played = g.move(san);
    return { fen: g.fen(), from: played.from, to: played.to, san: played.san };
  } catch {
    return null;
  }
}

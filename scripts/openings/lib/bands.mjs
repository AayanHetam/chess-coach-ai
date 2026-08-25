// Which rating band a game belongs to, and on whose scale.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE TRAP THIS MODULE EXISTS TO CLOSE
//
// `BANDS` in src/lib/repertoire/levels.ts has floors of 800 / 1200 / 1600 /
// 2000, and those are CHESS.COM numbers: `platformRatings.ts` normalises every
// player onto the chess.com scale, and `resolveUserRating` returns a number on
// it. The Lichess dumps carry raw Lichess Elo, which is a different scale
// entirely — chess.com 1200 is about Lichess 1560.
//
// Bucketing raw Lichess Elo against those floors would put markedly stronger
// players in every band than the label claims, and NOTHING would look wrong:
// the tree would build, the shares would sum to one, and every frequency on
// every screen would be measuring a population the label misnames. That is the
// failure mode this repo has been bitten by before — a number that is confident
// and answers a different question.
//
// So the conversion happens HERE, at bucket time, using the same anchors
// `normalizeRating` uses. A test in src/ asserts the two never drift.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lichess Elo → the common (chess.com) scale.
 *
 * Copied deliberately rather than imported: this runs in a build script that
 * must not pull the app's TypeScript module graph into a streaming parser. The
 * test that pins them together is the alternative to an import, and it is a
 * better one — it fails loudly instead of silently changing a build's meaning.
 */
export const LICHESS_TO_COMMON = [
  [800, 650],
  [1200, 900],
  [1500, 1150],
  [1800, 1500],
  [2100, 1900],
  [2400, 2300],
  [2700, 2700],
];

/** Piecewise-linear across the anchors, matching platformRatings.ts exactly. */
export function interpolate(value, anchors) {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (value <= first[0]) {
    const [x0, y0] = first;
    const [x1, y1] = anchors[1];
    const slope = (y1 - y0) / (x1 - x0);
    return y0 + (value - x0) * slope;
  }
  if (value >= last[0]) return last[1] + (value - last[0]);
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x0, y0] = anchors[i];
    const [x1, y1] = anchors[i + 1];
    if (value >= x0 && value <= x1) {
      return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return value;
}

/** A rating on the common scale. `lichess` is converted; `chesscom` is not. */
export function toCommonScale(rating, platform) {
  if (platform === 'chesscom') return Math.round(rating);
  return Math.round(interpolate(rating, LICHESS_TO_COMMON));
}

/**
 * The band floors, on the COMMON scale. Mirrors `BANDS` in levels.ts, and a
 * test asserts it — a second tuning table that drifts is worse than none.
 */
export const BAND_FLOORS = [
  { id: 'new', floor: 0 },
  { id: 'beginner', floor: 800 },
  { id: 'improving', floor: 1200 },
  { id: 'club', floor: 1600 },
  { id: 'strong', floor: 2000 },
];

/** The band a common-scale rating falls in. Mirrors `bandFor`, minus its default. */
export function bandOfCommon(rating) {
  if (!Number.isFinite(rating)) return null;
  let found = BAND_FLOORS[0].id;
  for (const band of BAND_FLOORS) if (rating >= band.floor) found = band.id;
  return found;
}

/** The band a RAW Lichess Elo falls in, converted first. */
export function bandOfLichess(elo) {
  if (!Number.isFinite(elo)) return null;
  return bandOfCommon(toCommonScale(elo, 'lichess'));
}

/**
 * Lichess's own speed classes, from the `TimeControl` header.
 *
 * `"300+3"` is base seconds plus increment. Lichess classifies on an ESTIMATED
 * duration of `base + 40 * increment`, so a 3+2 game is blitz and a 3+10 is
 * rapid — using the base alone would file a large slice of the site under the
 * wrong speed. `"-"` is correspondence.
 */
export function speedOf(timeControl) {
  // A MISSING header is not correspondence, it is unknown. Both end up dropped
  // from the corpus, and only one of them is honest about why — a header we
  // could not read must never be reported as a fact about the game.
  if (typeof timeControl !== 'string') return null;
  if (timeControl.trim() === '-') return 'correspondence';
  const m = /^(\d+)\+(\d+)$/.exec(timeControl.trim());
  if (!m) return null;
  const estimated = Number(m[1]) + 40 * Number(m[2]);
  if (estimated < 30) return 'ultrabullet';
  if (estimated < 180) return 'bullet';
  if (estimated < 480) return 'blitz';
  if (estimated < 1500) return 'rapid';
  return 'classical';
}

/** The speeds a repertoire corpus is built from. */
export const CORPUS_SPEEDS = new Set(['blitz', 'rapid']);

/**
 * The band one game counts towards, or null when it counts towards none.
 *
 * BOTH players must be in the band. A 1200 against a 2000 is not what either
 * band's play looks like: one side is out of their depth and the other is not
 * being tested, and counting it towards either would import the stronger
 * player's repertoire into the weaker player's frequencies. Measured on a
 * sample this drops a real fraction of games and it drops the least
 * representative ones.
 */
export function bandOfGame(headers, { platform = 'lichess' } = {}) {
  const speed = speedOf(headers.TimeControl);
  if (!speed || !CORPUS_SPEEDS.has(speed)) return null;
  const white = Number(headers.WhiteElo);
  const black = Number(headers.BlackElo);
  if (!Number.isFinite(white) || !Number.isFinite(black)) return null;
  const a =
    platform === 'lichess' ? bandOfLichess(white) : bandOfCommon(toCommonScale(white, platform));
  const b =
    platform === 'lichess' ? bandOfLichess(black) : bandOfCommon(toCommonScale(black, platform));
  return a !== null && a === b ? a : null;
}

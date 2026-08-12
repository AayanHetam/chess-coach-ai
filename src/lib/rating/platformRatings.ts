/**
 * Platform rating lookup — turn a Lichess / Chess.com username into a rating
 * the coach can calibrate on.
 *
 * WHY THIS EXISTS: asking a user to self-report a rating is a bad first
 * impression and a bad signal. They guess, they inflate, they leave it blank.
 * Their real rating is one public HTTP call away on either platform.
 *
 * ── The trap this module exists to avoid ──────────────────────────────────
 *
 * Lichess returns a `perfs` entry for EVERY time control, played or not.
 * Verified against the live API (Magnus Carlsen's account, 2026-08-11):
 *
 *     bullet          rating 3243  games 9583  prov undefined   ← real
 *     rapid           rating 2500  games    0  prov true        ← never played
 *     correspondence  rating 1500  games    0  prov true        ← never played
 *
 * A naive read of `perfs.rapid.rating` invents a 2500 rapid rating for a player
 * who has never played rapid, and hands a brand-new account 1500 across the
 * board. That 1500 is the exact fabricated default that SILENT_SUBSTITUTION
 * finding A1 removed from the analysis path — and re-introducing it here would
 * be worse, because it would arrive wearing the authority of "fetched from your
 * account".
 *
 * So: a perf counts ONLY if it is non-provisional AND has real games behind it.
 * Everything else is discarded, and a user with no established rating resolves
 * to `undefined` — never to a number. Same contract as `resolveUserRating`.
 */

export type Platform = "lichess" | "chesscom";

/** One time control's rating, as reported by the platform (raw, un-normalized). */
export interface PerfRating {
  /** Canonical time-control key: "bullet" | "blitz" | "rapid" | "classical" | "daily". */
  perf: string;
  /** The rating exactly as the platform reports it. Never normalized. */
  rating: number;
  /** Games played in this time control. */
  games: number;
}

export interface PlatformRatings {
  platform: Platform;
  username: string;
  /** Established perfs only, highest first. May be empty. */
  perfs: PerfRating[];
}

/**
 * Minimum games before a rating means anything. Both platforms seed new perfs
 * near 1500 and converge over the first dozen games; below this the number is
 * closer to the seed than to the player.
 */
export const MIN_ESTABLISHED_GAMES = 10;

/**
 * Time controls we calibrate from. Variants (chess960, atomic, crazyhouse…)
 * and correspondence/daily are excluded: they measure something other than
 * over-the-board thinking strength at a normal tempo.
 */
const CALIBRATION_PERFS = new Set(["bullet", "blitz", "rapid", "classical"]);

// ─── Lichess ────────────────────────────────────────────────────────────────

interface LichessPerf {
  rating?: number;
  games?: number;
  prov?: boolean;
}

/** Shape of the bits of `GET https://lichess.org/api/user/{name}` we read. */
export interface LichessUserResponse {
  id?: string;
  username?: string;
  perfs?: Record<string, LichessPerf | undefined>;
  disabled?: boolean;
  tosViolation?: boolean;
}

/**
 * Extract established perfs from a Lichess user payload.
 *
 * ── Why we do NOT filter on Lichess's `prov` flag ─────────────────────────
 *
 * `prov` tracks rating DEVIATION, which grows with inactivity — not just with
 * low game counts. Verified against live accounts (2026-08-11):
 *
 *     penguingm1  bullet 2542  games 853   prov true
 *     Magnus      blitz  3153  games 606   prov true
 *
 * Both are thoroughly established ratings on accounts that simply have not
 * played that control recently. Filtering on `prov` would throw them away and
 * report "no rating" for exactly the user most likely to show up here: someone
 * returning to chess after a break.
 *
 * The games floor alone is sufficient against the fabrication trap, because
 * every seeded phantom perf carries `games: 0`. So: games decide, `prov` is
 * ignored.
 */
export function parseLichessRatings(
  username: string,
  body: LichessUserResponse
): PlatformRatings {
  const perfs: PerfRating[] = [];
  for (const [perf, value] of Object.entries(body.perfs ?? {})) {
    if (!value || !CALIBRATION_PERFS.has(perf)) continue;
    const rating = value.rating;
    const games = value.games ?? 0;
    if (typeof rating !== "number" || !Number.isFinite(rating)) continue;
    if (games < MIN_ESTABLISHED_GAMES) continue;
    perfs.push({ perf, rating: Math.round(rating), games });
  }
  perfs.sort((a, b) => b.rating - a.rating);
  return { platform: "lichess", username, perfs };
}

// ─── Chess.com ──────────────────────────────────────────────────────────────

interface ChessComStatBlock {
  last?: { rating?: number; rd?: number };
  record?: { win?: number; loss?: number; draw?: number };
}

/** Shape of the bits of `GET https://api.chess.com/pub/player/{name}/stats` we read. */
export type ChessComStatsResponse = Record<string, ChessComStatBlock | unknown>;

/**
 * Chess.com has no `prov` flag, so establishment is inferred from the W/L/D
 * record. `chess_daily` and the variant pools are dropped by CALIBRATION_PERFS.
 */
const CHESSCOM_PERF_MAP: Record<string, string> = {
  chess_bullet: "bullet",
  chess_blitz: "blitz",
  chess_rapid: "rapid",
};

export function parseChessComRatings(
  username: string,
  body: ChessComStatsResponse
): PlatformRatings {
  const perfs: PerfRating[] = [];
  for (const [key, perf] of Object.entries(CHESSCOM_PERF_MAP)) {
    const block = body[key] as ChessComStatBlock | undefined;
    const rating = block?.last?.rating;
    if (typeof rating !== "number" || !Number.isFinite(rating)) continue;
    const rec = block?.record ?? {};
    const games = (rec.win ?? 0) + (rec.loss ?? 0) + (rec.draw ?? 0);
    if (games < MIN_ESTABLISHED_GAMES) continue;
    perfs.push({ perf, rating: Math.round(rating), games });
  }
  perfs.sort((a, b) => b.rating - a.rating);
  return { platform: "chesscom", username, perfs };
}

// ─── Cross-platform normalization ───────────────────────────────────────────

/**
 * Lichess and Chess.com are different rating pools and their numbers are NOT
 * interchangeable. The relationship is non-linear and it CROSSES OVER: through
 * the club range Lichess reads several hundred points higher than Chess.com for
 * the same player, while at master level the gap narrows and reverses.
 *
 * We normalize onto the Chess.com scale — the more conservative of the two
 * through the band this product actually serves — so that a Lichess user and a
 * Chess.com user of equal strength get equal coaching depth, and so that
 * picking the HIGHEST rating across platforms cannot be won automatically by
 * whichever platform happens to inflate.
 *
 * ⚠️ THESE NUMBERS ARE A CHESS-JUDGEMENT CALL, NOT A MEASUREMENT. They are a
 * documented approximation of the widely-cited community comparison and want
 * Aayan's sign-off. They are deliberately isolated in one table so tuning them
 * is a one-line change and never a code change. Displayed ratings are ALWAYS
 * raw — normalization only ever feeds coach calibration.
 *
 * Anchors are (lichessRating, chesscomEquivalent); between anchors we
 * interpolate linearly, and outside them we clamp to the end segments' slope.
 */
const LICHESS_TO_CHESSCOM_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [800, 650],
  [1200, 900],
  [1500, 1150],
  [1800, 1500],
  [2100, 1900],
  [2400, 2300],
  [2700, 2700],
];

/** Piecewise-linear interpolation across the anchor table. */
function interpolate(
  value: number,
  anchors: ReadonlyArray<readonly [number, number]>
): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (value <= first[0]) {
    // Extend the first segment's slope downward rather than flat-lining, so
    // beginners aren't all collapsed onto one number.
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

/**
 * Convert a platform rating onto the common calibration scale (Chess.com-like).
 * Chess.com ratings pass through unchanged by definition.
 */
export function normalizeRating(rating: number, platform: Platform): number {
  if (platform === "chesscom") return Math.round(rating);
  return Math.round(interpolate(rating, LICHESS_TO_CHESSCOM_ANCHORS));
}

// ─── Selection ──────────────────────────────────────────────────────────────

export interface RatingSelection {
  /** Normalized onto the common scale — this is what the coach calibrates on. */
  rating: number;
  /** The platform the winning rating came from. */
  platform: Platform;
  /** The time control it came from, e.g. "blitz". */
  perf: string;
  /** The platform's own number, un-normalized — this is what we SHOW the user. */
  rawRating: number;
  games: number;
}

/**
 * Pick the calibration rating: the highest ESTABLISHED rating the player holds,
 * compared on the normalized scale so cross-platform comparison is fair.
 *
 * Returns `undefined` when the player has no established rating anywhere —
 * a new account, a typo'd username, or someone who only plays variants. The
 * caller must treat that as "no rating", never as a default.
 */
export function selectCalibrationRating(
  sources: PlatformRatings[]
): RatingSelection | undefined {
  let best: RatingSelection | undefined;
  for (const src of sources) {
    for (const p of src.perfs) {
      const normalized = normalizeRating(p.rating, src.platform);
      if (!best || normalized > best.rating) {
        best = {
          rating: normalized,
          platform: src.platform,
          perf: p.perf,
          rawRating: p.rating,
          games: p.games,
        };
      }
    }
  }
  return best;
}

/**
 * Stage B 1.C.B.1 — wireValidators.ts
 *
 * The Mastermind validator pipeline (PR 1.B + Stage A) accepts up to four
 * data sources via runValidationPipeline's optional `dataSources` field.
 * This module is the *fetch helper* that resolves all four sources for one
 * turn — with failure independence — so the route never has to think about
 * partial failures.
 *
 * See PR_1C_STAGE_B_PLAN.md §3 for the canonical spec. Key invariants:
 *   - featureDelta failure THROWS — route catches and falls back to flag-off.
 *   - pieceRoleDiff failure returns []; pipeline runs without role checks.
 *   - scout / userHistory failure returns undefined; pipeline skips that
 *     validator (Stage A.9's `dataSources` extension preserves PR 1.B's
 *     byte-identical output when a source is omitted).
 *   - All four sources fetched concurrently via Promise.allSettled with a
 *     3s per-source timeout (T1 default; §3.3).
 */

import { compute_feature_delta } from "@/lib/mastermind/featureDelta";
import {
  classifyPieceRoles,
  diffPieceRoles,
} from "@/lib/mastermind/pieceRoles";
import { computeAnalytics } from "@/lib/scoutAnalytics";
import { fetchOpponentGames } from "@/lib/server/scoutFetch";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import { extractPgnHeaders } from "@/lib/utils/pgnHeaders";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { RoleChange } from "@/lib/mastermind/pieceRoles";
import type { ThreatNode } from "@/lib/mastermind/threatTree";
import type { ScoutAnalytics, Collisions } from "@/types/scout";
import type { UserHistoryGame } from "@/lib/mastermind/userHistoryAggregates";
import type { ScoutTimeClass } from "@/lib/mastermind/validators";

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface FetchedDataSources {
  // PR 1.A — always present (pipeline requires them at top-level).
  featureDelta: PositionFeatureDelta;
  pieceRoleDiff: RoleChange[];
  threatTree?: ThreatNode[];
  // Stage A.6 + A.8 — optional, fetched independently with failure tolerance.
  scout?: {
    scout: ScoutAnalytics;
    collisions?: Collisions;
    opponentUsername: string;
    primaryTimeClass?: ScoutTimeClass;
  };
  userHistory?: {
    games: UserHistoryGame[];
    userName: string;
    nowMs?: number;
  };
}

export interface FetchOpts {
  /** Position before the move (or the current position for chat). */
  fenBefore: string;
  /** Position after the move (or same as fenBefore for chat). */
  fenAfter: string;
  /** Optional resolution-point FEN — caller supplies if known. */
  fenAtResolution?: string;
  /** PV from Stockfish for find_resolution_point fallback. */
  pv?: string[];
  /** Optional move history for chat context. */
  moveHistory?: string[];
  /** Full PGN body if available — used for opponent-name parsing per T11 (c). */
  pgn?: string;

  /** Player perspective for telemetry / role-diff orientation. */
  playerPerspective: "white" | "black";

  /** Per-turn telemetry context (used in warning logs on source failure). */
  correlationId: string;

  /** Authenticated user's UID — for Firestore games subcollection read. */
  uid: string;

  /** User's primary identifier — for detectUserColor matching across games. */
  userName: string;

  /**
   * Optional explicit opponent username (T11 Option (c) fallback). When PGN
   * parsing yields no opponent, the route can pass this through from a new
   * optional `opponentUsername` request field. /api/chat does not use this.
   */
  opponentUsername?: string;

  /** Opponent's platform if known — overrides PGN-derived platform. */
  opponentPlatform?: "lichess" | "chess.com";

  /** Time-class hint for Scout rating disambiguation; optional. */
  primaryTimeClass?: ScoutTimeClass;

  /**
   * History window in months for Scout fetch. Default 3 — matches the
   * typical scout-page usage and is what /api/scout's request schema
   * accepts. Overridable for tests.
   */
  opponentHistoryMonths?: number;

  /**
   * Per-source timeout in ms. Default 3000 (§3.3 T1 default). On timeout
   * the source is treated as failed per §3.2. Overridable for tests.
   */
  perSourceTimeoutMs?: number;

  /**
   * Firestore games-query bound. Default 200 (§12.3 T12 ratified).
   * Overridable for tests.
   */
  userHistoryGamesLimit?: number;
}

const DEFAULT_PER_SOURCE_TIMEOUT_MS = 3000;
const DEFAULT_USER_HISTORY_GAMES_LIMIT = 200;
const DEFAULT_OPPONENT_HISTORY_MONTHS = 3;

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve all four data sources for a single Mastermind turn with failure
 * independence (§3.2). featureDelta is required — its failure propagates
 * so the route can switch to flag-off. The other three degrade gracefully.
 */
export async function fetchDataSources(
  opts: FetchOpts,
): Promise<FetchedDataSources> {
  const timeoutMs = opts.perSourceTimeoutMs ?? DEFAULT_PER_SOURCE_TIMEOUT_MS;

  const [fdResult, roleDiffResult, scoutResult, userHistoryResult] =
    await Promise.allSettled([
      withTimeout(computeFeatureDelta(opts), timeoutMs, "featureDelta"),
      withTimeout(computeRoleDiff(opts), timeoutMs, "pieceRoleDiff"),
      withTimeout(fetchScoutWithFailureTolerance(opts), timeoutMs, "scout"),
      withTimeout(
        fetchUserHistoryWithFailureTolerance(opts),
        timeoutMs,
        "userHistory",
      ),
    ]);

  if (fdResult.status === "rejected") {
    // featureDelta is required — propagate so route falls back to flag-off.
    // §3.2: "FD throws → Route skips pipeline entirely for the turn."
    logSourceFailure("featureDelta", fdResult.reason, opts.correlationId);
    throw fdResult.reason instanceof Error
      ? fdResult.reason
      : new Error(`featureDelta failed: ${String(fdResult.reason)}`);
  }

  const pieceRoleDiff =
    roleDiffResult.status === "fulfilled" ? roleDiffResult.value : [];
  if (roleDiffResult.status === "rejected") {
    logSourceFailure(
      "pieceRoleDiff",
      roleDiffResult.reason,
      opts.correlationId,
    );
  }

  const scout =
    scoutResult.status === "fulfilled" ? scoutResult.value : undefined;
  if (scoutResult.status === "rejected") {
    logSourceFailure("scout", scoutResult.reason, opts.correlationId);
  }

  const userHistory =
    userHistoryResult.status === "fulfilled"
      ? userHistoryResult.value
      : undefined;
  if (userHistoryResult.status === "rejected") {
    logSourceFailure(
      "userHistory",
      userHistoryResult.reason,
      opts.correlationId,
    );
  }

  return {
    featureDelta: fdResult.value,
    pieceRoleDiff,
    scout,
    userHistory,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Per-source fetchers
// ─────────────────────────────────────────────────────────────────────

async function computeFeatureDelta(
  opts: FetchOpts,
): Promise<PositionFeatureDelta> {
  return compute_feature_delta(opts.fenBefore, opts.fenAfter, {
    fenAtResolution: opts.fenAtResolution,
    pv: opts.pv,
  });
}

async function computeRoleDiff(opts: FetchOpts): Promise<RoleChange[]> {
  const before = classifyPieceRoles(opts.fenBefore);
  const after = classifyPieceRoles(opts.fenAfter);
  return diffPieceRoles(before, after);
}

async function fetchScoutWithFailureTolerance(
  opts: FetchOpts,
): Promise<NonNullable<FetchedDataSources["scout"]> | undefined> {
  const opponentUsername = resolveOpponent(opts);
  if (!opponentUsername) {
    return undefined;
  }

  const platform =
    opts.opponentPlatform ?? detectPlatformFromPgn(opts.pgn) ?? "chess.com";
  const months =
    opts.opponentHistoryMonths ?? DEFAULT_OPPONENT_HISTORY_MONTHS;

  const payload = await fetchOpponentGames(opponentUsername, platform, months);
  const scoutAnalytics = computeAnalytics(payload.games, opponentUsername);

  return {
    scout: scoutAnalytics,
    // Collisions are computed against the user's repertoire — left undefined
    // for Stage B. A future commit can wire user-repertoire collision
    // detection if Stage C surfaces a need.
    collisions: undefined,
    opponentUsername,
    primaryTimeClass: opts.primaryTimeClass,
  };
}

async function fetchUserHistoryWithFailureTolerance(
  opts: FetchOpts,
): Promise<NonNullable<FetchedDataSources["userHistory"]> | undefined> {
  const db = await getAdminFirestore();
  const limit = opts.userHistoryGamesLimit ?? DEFAULT_USER_HISTORY_GAMES_LIMIT;

  const snap = await db
    .collection("users")
    .doc(opts.uid)
    .collection("games")
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  const games = snap.docs.map((d) => d.data() as UserHistoryGame);

  return {
    games,
    userName: opts.userName,
    nowMs: Date.now(),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Opponent resolution (T11 Option (c))
// ─────────────────────────────────────────────────────────────────────

/**
 * Resolve the opponent's username for Scout fetch per T11 Option (c):
 *   1. PGN parse — match userName against the White/Black header, take the
 *      other side.
 *   2. Fall back to opts.opponentUsername if PGN parse yielded nothing.
 *   3. Return undefined if neither resolves — Scout fetch is skipped.
 *
 * Exported for unit testing of the resolution chain.
 */
export function resolveOpponent(opts: FetchOpts): string | undefined {
  if (opts.pgn) {
    const fromPgn = parseOpponentFromPgn(opts.pgn, opts.userName);
    if (fromPgn) return fromPgn;
  }
  if (opts.opponentUsername && opts.opponentUsername.trim().length > 0) {
    return opts.opponentUsername.trim();
  }
  return undefined;
}

function parseOpponentFromPgn(
  pgn: string,
  userName: string,
): string | undefined {
  const headers = extractPgnHeaders(pgn);
  const white = headers.White ?? "";
  const black = headers.Black ?? "";
  if (!white && !black) return undefined;

  const userLower = userName.toLowerCase();
  // Match userName substring-case-insensitive (matches the Stage A.7
  // detectUserColor pattern). When the user is white, opponent is black;
  // and vice versa.
  if (white.toLowerCase().includes(userLower) && black) return black;
  if (black.toLowerCase().includes(userLower) && white) return white;
  return undefined;
}

function detectPlatformFromPgn(
  pgn: string | undefined,
): "lichess" | "chess.com" | undefined {
  if (!pgn) return undefined;
  const headers = extractPgnHeaders(pgn);
  const site = (headers.Site ?? "").toLowerCase();
  if (site.includes("lichess")) return "lichess";
  if (site.includes("chess.com")) return "chess.com";
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(handle);
        resolve(value);
      },
      (err) => {
        clearTimeout(handle);
        reject(err);
      },
    );
  });
}

/**
 * Structured warning emit for a failed source. The full Sentry integration
 * (correlation-id-keyed, tagged events) lands in 1.C.B.2 (validatorTelemetry.ts);
 * for now we use console.warn with a stable prefix so the route can route logs
 * to Sentry on its own side. Module tag matches the validator_event convention
 * for cross-correlation when the Sentry side comes online.
 */
function logSourceFailure(
  source: "featureDelta" | "pieceRoleDiff" | "scout" | "userHistory",
  reason: unknown,
  correlationId: string,
): void {
  const message =
    reason instanceof Error ? reason.message : String(reason ?? "unknown");
  console.warn(
    `[mastermind-validator] source=${source} correlation_id=${correlationId} failed: ${message}`,
  );
}

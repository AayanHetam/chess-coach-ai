/**
 * buildCoachContract — assembles the CoachContract from the same inputs
 * buildGameContext takes (PR-CI-1 scope item 3).
 *
 * PERFORMANCE CHANGE (plan §1 "free win", the ONLY sanctioned behavior
 * change in this PR): all per-insight grounding fetches — chessdb / Lc0 /
 * Maia across the top-10 mistakes AND the top-3 intelligence layer — launch
 * in ONE Promise.all, deduped by FEN (Maia by FEN+bestMove). Legacy fetched
 * the top-10 in parallel but then re-fetched the intelligence layer's FENs
 * serially inside a for-loop (route.ts:849-855 pre-move), costing 2-6s of
 * hidden latency and up to 3 redundant round-trips. Results are routed to
 * each insight exactly as legacy routed them (same gates, same inputs), so
 * the rendered text is unchanged — the snapshot suite proves it.
 *
 * PATHWAY 4.8a: the build is split around those fetches. `beginCoachContract`
 * launches them, `prepare` computes everything that does not read them, and
 * `ground` writes the contract over any snapshot of what has answered. A
 * fetch still in flight reads as unavailable, exactly as a timeout reads.
 * `buildCoachContract` waits for every fetch and grounds once, so its
 * contract is byte for byte what it always was. COACH_TURN1_EARLY_STREAM
 * grounds the prompt early (legacyGameContext.ts).
 */
import { Chess } from "chess.js";
import { annotatePosition, annotationToPromptContext } from "@/lib/positionAnnotator";
import { detectMotifs } from "@/lib/tactics";
import { buildLineStory, type LineStory } from "./lineStory";
import { logger } from "@/lib/logging";

const log = logger.child({ module: "contract-builder" });
import type { AnyMotif } from "@/lib/tactics";
import { buildMotifLicense } from "./motifScope";
import { queryChessdb, FETCH_TIMEOUT_MS as CHESSDB_TIMEOUT_MS, type ChessdbResult } from "@/lib/grounding/chessdb";
import { isCircuitOpen, recordFanOut, type FanOutOutcome } from "@/lib/grounding/circuitBreaker";
import { compileVoterResult } from "@/lib/grounding/voter";
import {
  queryLc0,
  shouldCallLc0,
  lc0AgreesWithSf,
  __isLc0Configured,
  FETCH_TIMEOUT_MS as LC0_TIMEOUT_MS,
  type Lc0Result,
} from "@/lib/grounding/lc0";
import {
  queryMaiaAtRating,
  shouldCallMaia,
  probToVisibility,
  __isMaiaConfigured,
  FETCH_TIMEOUT_MS as MAIA_TIMEOUT_MS,
  type MaiaProbResult,
} from "@/lib/grounding/maia";
import { buildRelationalFacts } from "@/lib/relational/relationalFactsBuilder";
import { intentFactsForPlies, isIntentFactsEnabled } from "@/lib/intent/reviewFacts";
import type { GameEval } from "@/types/eval";
import type { RelationalFactsBlock } from "@/lib/relational/relationalFactsBuilder";
import { detectConcepts } from "@/lib/concept/conceptDetector";
import { getConcept } from "@/lib/concept/conceptTaxonomy";
import { compute_feature_delta } from "@/lib/mastermind/featureDelta";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import { buildThreatTree } from "@/lib/mastermind/threatTree";
import type { ThreatNode } from "@/lib/mastermind/threatTree";
import { generateContextId } from "@/lib/analysisContextCache";
import {
  buildExplanationSeed,
  convertPvToSan,
  describeMoveChange,
  fensAlongGame,
  findBranchPoint,
  getMaterialBalance,
  sanPvToUci,
  uciToSan,
} from "./chessFormat";
import { computeEvalIntegrity } from "./gameEvalSchema";
import { isComparableDepthPair, requestedDepth } from "./evalDepth";
import type { GameEvalInput, GameHeadersInput, PositionEvalInput } from "./gameEvalSchema";
import { flattenEval, selectInsights } from "./selectInsights";
import {
  CONTRACT_VERSION,
  type BranchPointFact,
  type CoachContract,
  type ConceptFact,
  type Degraded,
  type EvalFact,
  type InsightContract,
  type InsightSayables,
  type IntelBranchPointFact,
  type LineFact,
  type MoveTableEntry,
} from "./types";

export interface BuildCoachContractArgs {
  moveHistory: string[];
  gameEval: GameEvalInput | undefined;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
  uid?: string;
  /**
   * Identity inputs for contractId (PR-CI-2, closing the CI-1 follow-up):
   * the route's request-body `fen` and its `playerColor || "w"` defaulting,
   * so contractId ≡ the route's contextId EXACTLY (one identity for response
   * cache, chat context, and telemetry — plan §2). Rendering NEVER reads
   * these. When absent (tests/older call sites) the fallback is
   * {fen: undefined, playerColor: playerColor || "w"} — the same shape
   * generateContextId sees on the route for a moveHistory-only request.
   */
  identity?: { fen?: string; playerColor?: string };
}

type RawLine = PositionEvalInput["lines"][number];

// ── EvalFact construction ───────────────────────────────────────────────────
function evalFactFromLine(line: RawLine | undefined): EvalFact {
  const cp = line?.cp === undefined ? null : line.cp;
  const mate = line?.mate === undefined ? null : line.mate;
  const depth = line?.depth ?? 0;
  const sentinel = line?.depth === 0;
  let display = "";
  if (sentinel) display = "engine data unavailable";
  else if (mate !== null) display = `M${mate > 0 ? "+" : ""}${mate}`;
  else if (cp !== null) display = `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`;
  return {
    cp,
    mate,
    depth,
    sentinel,
    display,
    provenance: { source: "stockfish_client", confidence: "client_reported", depth },
  };
}

// ── Sayables (parallel map — source modules untouched, see types.ts note) ──
function motifSayable(m: AnyMotif): string {
  const status = m.confirmed ? "Confirmed" : m.refutation ? `Refuted by ${m.refutation.move}` : "Unconfirmed";
  switch (m.motif) {
    case "fork":
      return `${status}: fork by the ${m.by_piece} on ${m.by_square} hitting ${m.targets
        .map((t) => `${t.piece} on ${t.square}`)
        .join(" and ")}.`;
    case "pin":
      return `${status}: ${m.kind} pin${m.createdByMove === false ? " (already on the board before this move)" : ""} — ${m.pinner.piece} on ${m.pinner.square} pins ${m.pinned.piece} on ${m.pinned.square} against ${m.behind.piece} on ${m.behind.square}.`;
    case "skewer":
      return `${status}: skewer — ${m.skewerer.piece} on ${m.skewerer.square} hits ${m.front.piece} on ${m.front.square} in front of ${m.back.piece} on ${m.back.square}.`;
    case "discovered_attack":
      return `${status}: discovered attack — moving ${m.mover.piece} ${m.mover.from}→${m.mover.to} unveils ${m.revealer.piece} on ${m.revealer.square} against ${m.victim.piece} on ${m.victim.square}.`;
    case "removed_defender":
      return `${status}: removing the defender ${m.removed.piece} on ${m.removed.square} exposes ${m.was_defending.piece} on ${m.was_defending.square}.`;
    case "hanging_piece":
      return `${status}: ${m.piece} on ${m.square} is hanging (${m.attackers.length} attacker(s), ${m.defenders.length} defender(s)).`;
    case "trapped_piece":
      return `${status}: ${m.piece} on ${m.square} is trapped.`;
    case "back_rank_mate":
    case "back_rank_threat":
      return `${status}: back-rank ${m.motif === "back_rank_mate" ? "mate" : "threat"} by ${m.delivering_piece} on ${m.delivering_square} against the king on ${m.king_square}.`;
  }
}

function buildSayables(motifs: AnyMotif[], relational: RelationalFactsBlock | null): InsightSayables {
  return {
    motifs: motifs.map(motifSayable),
    relationalCaptures: (relational?.captures ?? []).map(
      (c) => `${c.attackerColor}${c.attackerType.toUpperCase()} on ${c.attackerSquare} can capture ${c.targetType} on ${c.targetSquare}.`,
    ),
    relationalHanging: (relational?.hanging ?? []).map(
      (h) => `${h.color}${h.pieceType.toUpperCase()} on ${h.square} is attacked ${h.attackerSquares.length}x and defended ${h.defenderSquares.length}x.`,
    ),
    relationalPins: (relational?.pins ?? []).map(
      (p) => `${p.pinnerType.toUpperCase()} on ${p.pinnerSquare} pins ${p.pinnedType} on ${p.pinnedSquare} against ${p.behindType} on ${p.behindSquare}${p.isAbsolute ? " (absolute)" : ""}.`,
    ),
  };
}

// ── Degraded source wrappers ────────────────────────────────────────────────
function degradeChessdb(result: ChessdbResult | null): InsightContract["chessdb"] {
  if (result && result.outcome !== "unknown" && result.score_cp !== null) {
    return {
      status: "ok",
      value: { evalCp: result.score_cp, outcomeText: result.outcome },
      provenance: { source: "chessdb", confidence: "engine_verified" },
    };
  }
  return {
    status: "unavailable",
    // null = fetch/network failure; a resolved-but-unknown position is the
    // chessdb cache simply not covering it.
    reason: result ? "out_of_range" : "service_error",
    claimClassesForbidden: [],
  };
}

const SYZYGY_NOT_APPLICABLE: Degraded<{ category: string; dtmMoves: number | null }> = {
  status: "unavailable",
  // Honest to today's game path: Syzygy only runs on position-only analysis.
  reason: "not_applicable",
  claimClassesForbidden: ["endgame_wdl"],
};

function degradeLc0(result: Lc0Result | null, gateFired: boolean, sfCp: number | null): InsightContract["lc0"] {
  if (result && result.eval_cp !== null) {
    return {
      status: "ok",
      value: { evalCp: result.eval_cp, agreesWithSf: lc0AgreesWithSf(sfCp, result.eval_cp) },
      provenance: { source: "lc0", confidence: "engine_verified" },
    };
  }
  return {
    status: "unavailable",
    reason: !__isLc0Configured() ? "service_unconfigured" : gateFired ? "service_error" : "out_of_range",
    claimClassesForbidden: ["positional_plan"],
  };
}

function degradeVisibility(
  result: MaiaProbResult | null,
  gateFired: boolean,
): InsightContract["visibility"] {
  if (result) {
    return {
      status: "ok",
      value: { probPlaysBest: result.prob_plays_best, level: probToVisibility(result.prob_plays_best) },
      provenance: { source: "maia", confidence: "heuristic" },
    };
  }
  return {
    status: "unavailable",
    reason: !__isMaiaConfigured() ? "service_unconfigured" : gateFired ? "service_error" : "not_applicable",
    claimClassesForbidden: ["user_visibility"],
  };
}

// ── Line facts ──────────────────────────────────────────────────────────────
function buildLineFacts(idPrefix: string, fenBefore: string, playedSan: string, lines: RawLine[], movedFrom: ReadonlySet<string>): LineFact[] {
  return lines.map((l, idx) => {
    const pvUci = l.pv ?? [];
    const san = pvUci.length > 0 ? convertPvToSan(fenBefore, pvUci) : [];
    // Legacy candidate loop: firstMove = pvSan[0] ?? pvLine.pv[0]
    const firstMove = san.length > 0 ? san[0] : pvUci[0];
    return {
      id: `${idPrefix}.pv${idx}`,
      san,
      pvUci,
      eval: evalFactFromLine(l),
      isPlayedLine: firstMove === playedSan,
      story: safeLineStory(fenBefore, san, movedFrom),
    };
  });
}

/** Never lets a story failure take the contract down: an empty story is "nothing to say". */
function safeLineStory(fenStart: string, san: readonly string[], movedFrom: ReadonlySet<string>): LineStory | undefined {
  if (san.length === 0) return undefined;
  try {
    return buildLineStory(fenStart, san, { maxPlies: STORY_MAX_PLIES, movedFrom });
  } catch {
    return undefined;
  }
}
/** Plies narrated per line. Six covers the tactical point of almost every engine line;
 * longer PVs are the model's cue to say "and so on" rather than invent. */
const STORY_MAX_PLIES = 6;


// ── Grounding (pathway 4.8a) ────────────────────────────────────────────────
/** The three sources the review grounds its insights on. */
export type GroundingSource = "chessdb" | "lc0" | "maia";

/**
 * What the review's grounding fetches had answered at one moment. A key that
 * is absent (a fetch still in flight, or one the breaker skipped) reads as
 * unavailable, exactly as a fetch that timed out reads.
 */
export interface ContractGrounding {
  /** By fenBefore. */
  readonly chessdb: ReadonlyMap<string, ChessdbResult | null>;
  /** By fenBefore, gated plies only. */
  readonly lc0: ReadonlyMap<string, Lc0Result | null>;
  /** By `${fenBefore}::${bestUci}`. */
  readonly maia: ReadonlyMap<string, MaiaProbResult | null>;
  /** Every fetch that was launched had settled. */
  readonly complete: boolean;
}

/** Nothing answered: the prompt an outage of every source produces. */
export const EMPTY_GROUNDING: ContractGrounding = {
  chessdb: new Map(),
  lc0: new Map(),
  maia: new Map(),
  complete: false,
};

/**
 * How long a late grounding result may keep the referee waiting, counted from
 * launch: the slowest client's own timeout plus one second. Every client
 * aborts at its timeout and resolves null, so past this no fetch is left
 * that could still answer.
 */
export const TURN1_GROUNDING_SETTLE_CAP_MS =
  Math.max(CHESSDB_TIMEOUT_MS, LC0_TIMEOUT_MS, MAIA_TIMEOUT_MS) + 1000;

export interface BeginCoachContractOpts {
  /**
   * Send the fetches through the per-source breaker (COACH_TURN1_EARLY_STREAM).
   * A source whose breaker is open at launch is not fetched, and each source's
   * fan-out is recorded as one breaker event once it settles. Off, the
   * builder never consults the breaker.
   */
  breaker: boolean;
}

export interface PendingCoachContract {
  /** Epoch ms at which the fetches were launched. */
  readonly launchedAtMs: number;
  /** Fetches actually sent, per source (deduped, breaker skips left out). */
  readonly launched: Readonly<Record<GroundingSource, number>>;
  /**
   * What has answered `msFromLaunch` after launch, or as soon as every fetch
   * has settled, whichever comes first. `Infinity` waits for all. Never rejects.
   */
  within(msFromLaunch: number): Promise<ContractGrounding>;
  /** The grounding-free half, yielding between insights. Idempotent. */
  prepare(): Promise<void>;
  /**
   * The contract over this grounding. Computes whatever of the half is left
   * synchronously, returns fresh contract and insight objects on every call,
   * and never mutates an earlier result.
   */
  ground(g: ContractGrounding): CoachContract;
}

/** One source's fan-out for one review. */
interface SourceFanOut<T> {
  readonly key: GroundingSource;
  readonly timeoutMs: number;
  /** Breaker open at launch: nothing is fetched. */
  readonly open: boolean;
  /** Every key the build asked for (deduped), fetched or not. */
  readonly wanted: Set<string>;
  readonly settled: Map<string, T | null>;
  readonly outcomes: FanOutOutcome[];
  readonly pending: Promise<void>[];
  /** The slowest fetch to settle, an answer or not. */
  slowestMs: number;
  /** The slowest fetch that answered, what the prompt's wait is set from. */
  slowestOkMs: number;
}

function newFanOut<T>(key: GroundingSource, timeoutMs: number, open: boolean): SourceFanOut<T> {
  return {
    key,
    timeoutMs,
    open,
    wanted: new Set(),
    settled: new Map(),
    outcomes: [],
    pending: [],
    slowestMs: 0,
    slowestOkMs: 0,
  };
}

/** A value the source client served from its own cache, which says nothing about the source. */
const fromClientCache = (value: unknown): boolean =>
  typeof value === "object" && value !== null && (value as { source?: unknown }).source === "cache";

/**
 * Launch one deduped fetch. A rejection settles as null, as `.catch(() => null)`
 * always did. A client cache hit is no outcome for the breaker: it would
 * count as the source answering while the source itself hangs.
 */
function launchFetch<T>(src: SourceFanOut<T>, mapKey: string, fetchFn: () => Promise<T | null>): void {
  if (src.wanted.has(mapKey)) return;
  src.wanted.add(mapKey);
  if (src.open) return;
  const start = Date.now();
  const settle = (value: T | null, threw: boolean) => {
    const elapsedMs = Date.now() - start;
    src.settled.set(mapKey, value);
    if (!fromClientCache(value)) src.outcomes.push({ value, elapsedMs, threw });
    if (elapsedMs > src.slowestMs) src.slowestMs = elapsedMs;
    if (value != null && elapsedMs > src.slowestOkMs) src.slowestOkMs = elapsedMs;
  };
  src.pending.push(
    fetchFn().then(
      (value) => settle(value ?? null, false),
      () => settle(null, true),
    ),
  );
}

/** Lets a ready network response be handled between two insights' CPU work. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setImmediate === "function") setImmediate(resolve);
    else setTimeout(resolve, 0);
  });
}

interface PlyFetchPlan {
  ply: number;
  fenBefore: string;
  sfCp: number | null;
  bestUci: string | null;
  lc0Gate: boolean;
  maiaGate: boolean;
}

/** The insight keys whose values depend on the grounding fetches (the voter's four and the three sources). */
type GroundedInsightKey =
  | "allowedTacticalKeywords"
  | "voterConfidence"
  | "positionConfidence"
  | "groundingContext"
  | "chessdb"
  | "lc0"
  | "visibility";

/** One insight's grounding-free half: everything but the grounded keys, and the voter's other inputs. */
interface PreparedInsight {
  plan: PlyFetchPlan;
  fields: Omit<InsightContract, GroundedInsightKey | "syzygy">;
  voterInputs: {
    motifs: AnyMotif[];
    bestMoveSan: string | null;
    stockfishEvalCp: number | null;
    stockfishBestMoveMate: number | null;
  };
}

// ── The builder ─────────────────────────────────────────────────────────────
/**
 * The contract with every grounding fetch settled. Same order as it always
 * had: the fetches settle, `contract_grounding_fetched` is logged, then the
 * CPU work runs. Never consults the breaker.
 */
export async function buildCoachContract(args: BuildCoachContractArgs): Promise<CoachContract> {
  const pending = beginCoachContract(args, { breaker: false });
  return pending.ground(await pending.within(Infinity));
}

/**
 * Starts a contract build: replays the game, selects the insights, builds the
 * move table and launches every grounding fetch, then hands back the parts
 * that wait on them. The grounding-free half (`prepare`) can run while the
 * fetches are in flight, and `ground` turns any snapshot of them into a
 * contract. With every fetch settled the contract is the one
 * `buildCoachContract` returns.
 */
export function beginCoachContract(args: BuildCoachContractArgs, opts: BeginCoachContractOpts): PendingCoachContract {
  const { moveHistory, gameEval, playerColor, username, userRating, gameHeaders, uid, identity } = args;
  const t0 = Date.now();

  // --- Game replay (identical to legacy: stop at the first bad SAN) ---
  const totalHalfMoves = moveHistory.length;
  const totalFullMoves = Math.ceil(totalHalfMoves / 2);
  const game = new Chess();
  let replayedPlies = 0;
  for (const m of moveHistory) {
    try {
      game.move(m);
      replayedPlies++;
    } catch {
      break;
    }
  }
  const historyTruncated = replayedPlies < totalHalfMoves;
  // From-squares of every played move, so a story at ply P knows which home
  // squares have been vacated since move 1 ("develops" must not fire for a
  // knight passing back through f1).
  const fromSquares = game.history({ verbose: true }).map((m) => m.from as string);
  const finalFen = game.fen();
  const finalMaterial = getMaterialBalance(game);
  const resultText = game.isCheckmate()
    ? ("Checkmate" as const)
    : game.isStalemate()
      ? ("Stalemate" as const)
      : game.isDraw()
        ? ("Draw" as const)
        : ("In progress" as const);

  const positions = gameEval?.positions;
  const hasGameEval = !!(positions && positions.length > 0);

  const evalIntegrity = computeEvalIntegrity(gameEval, moveHistory, replayedPlies);
  const declaredDepth = requestedDepth(gameEval);
  const selection = selectInsights(moveHistory, gameEval, playerColor);

  // --- pgnHeaders: only truthy fields, keyed by GameHeadersInput names ---
  const pgnHeaders: Record<string, string> = {};
  if (gameHeaders) {
    for (const key of [
      "white",
      "black",
      "whiteElo",
      "blackElo",
      "event",
      "date",
      "result",
      "eco",
      "opening",
      "timeControl",
    ] as const) {
      const v = gameHeaders[key];
      if (v) pgnHeaders[key] = v;
    }
  }

  // --- Move table ---
  // One walk through the game for every FEN the builder needs: the
  // per-ply replays this replaced were quadratic (see fensAlongGame).
  const fens = fensAlongGame(moveHistory);
  const moveTable: MoveTableEntry[] = [];
  for (let i = 0; i < moveHistory.length; i++) {
    const base = {
      ply: i,
      moveNumber: Math.floor(i / 2) + 1,
      color: (i % 2 === 0 ? "w" : "b") as "w" | "b",
      san: moveHistory[i],
    };
    if (!hasGameEval) {
      // Legacy only computes per-move FENs/descriptions inside the gameEval
      // branch — mirrored so the no-eval path costs what it always cost.
      moveTable.push({
        ...base,
        fenBefore: null,
        fenAfter: null,
        changeDescription: null,
        classification: null,
        evalAfter: null,
        bestWas: null,
      });
      continue;
    }
    const fenBefore = fens[i];
    const fenAfter = fens[i + 1];
    const evalBefore = positions![i];
    const evalAfter = positions![i + 1];

    let bestWas: MoveTableEntry["bestWas"] = null;
    if (evalBefore?.bestMove && evalBefore.bestMove !== "N/A") {
      const bestSan = uciToSan(fenBefore, evalBefore.bestMove);
      if (bestSan !== moveHistory[i]) {
        const bestLine = evalBefore.lines?.[0];
        if (bestLine?.pv && bestLine.pv.length > 0) {
          bestWas = {
            san: bestSan,
            line: {
              san: convertPvToSan(fenBefore, bestLine.pv),
              pvUci: bestLine.pv,
              eval: evalFactFromLine(bestLine),
            },
          };
        } else {
          bestWas = { san: bestSan, line: null };
        }
      }
    }

    moveTable.push({
      ...base,
      fenBefore,
      fenAfter,
      changeDescription: describeMoveChange(fenBefore, moveHistory[i]),
      // T8: `moveClassification` is computed client-side from exactly the
      // pairwise subtraction the swing scans now refuse — positions[i] vs
      // positions[i+1] — so a pair the engine searched to two different
      // depths yields a label with the same fabricated swing behind it.
      // Dropping it here rather than in the renderer matters: the referee
      // validates prose AGAINST the contract, so a label that reaches this
      // object is one the referee will certify as backed.
      classification: isComparableDepthPair(evalBefore, evalAfter, declaredDepth)
        ? (evalAfter?.moveClassification ?? null)
        : null,
      evalAfter: evalAfter?.lines?.[0] ? evalFactFromLine(evalAfter.lines[0]) : null,
      bestWas,
    });
  }

  // --- Insight union (top-10 ∪ intel-3) keyed by ply ---
  const topRankByPly = new Map<number, number>();
  selection.topMistakes.forEach((m, idx) => topRankByPly.set(m.ply, idx + 1));
  const intelRankByPly = new Map<number, number>();
  selection.intelligenceTop3.forEach((m, idx) => intelRankByPly.set(m.ply, idx + 1));
  const unionPlies = Array.from(
    new Set([...Array.from(topRankByPly.keys()), ...Array.from(intelRankByPly.keys())]),
  ).sort((a, b) => a - b);

  // --- Every grounding fetch, launched at once and deduped ---
  // chessdb dedupes by FEN; Lc0 by FEN (gate inputs are identical for a given
  // ply's evalBefore, and identical FENs from repetition share the position);
  // Maia by FEN+bestUci (the rating is constant per request). With the
  // breaker, a source whose breaker is open is skipped outright.
  const nowAtLaunch = Date.now();
  const openAtLaunch = (key: GroundingSource) => opts.breaker && isCircuitOpen(key, nowAtLaunch);
  const chessdbFanOut = newFanOut<ChessdbResult>("chessdb", CHESSDB_TIMEOUT_MS, openAtLaunch("chessdb"));
  const lc0FanOut = newFanOut<Lc0Result>("lc0", LC0_TIMEOUT_MS, openAtLaunch("lc0"));
  const maiaFanOut = newFanOut<MaiaProbResult>("maia", MAIA_TIMEOUT_MS, openAtLaunch("maia"));

  const plans = new Map<number, PlyFetchPlan>();

  for (const ply of unionPlies) {
    const evalBefore = positions?.[ply];
    const fenBefore = fens[ply];
    const sfCp = evalBefore?.lines?.[0]?.cp ?? null;
    const bestUci = evalBefore?.lines?.[0]?.pv?.[0] ?? null;
    const lc0Gate = shouldCallLc0(sfCp, evalBefore?.lines ?? []);
    const maiaGate = shouldCallMaia(userRating, bestUci);
    plans.set(ply, { ply, fenBefore, sfCp, bestUci, lc0Gate, maiaGate });

    launchFetch(chessdbFanOut, fenBefore, () => queryChessdb(fenBefore));
    if (lc0Gate) launchFetch(lc0FanOut, fenBefore, () => queryLc0(fenBefore));
    if (maiaGate) {
      launchFetch(maiaFanOut, `${fenBefore}::${bestUci}`, () =>
        queryMaiaAtRating(fenBefore, userRating!, bestUci!),
      );
    }
  }

  const tFetchStart = Date.now();
  const beginCpuMs = tFetchStart - t0;
  const fanOuts = [chessdbFanOut, lc0FanOut, maiaFanOut] as const;
  const launched = {
    chessdb: chessdbFanOut.pending.length,
    lc0: lc0FanOut.pending.length,
    maia: maiaFanOut.pending.length,
  };

  const sourceSettled = <T>(src: SourceFanOut<T>): Promise<void> =>
    Promise.all(src.pending).then(() => {
      if (opts.breaker) recordFanOut(src.key, src.outcomes, src.timeoutMs, Date.now());
    });

  // T4 (SILENT_SUBSTITUTION_HANDOFF §4): until this line existed, the
  // prompt-side grounding path was completely unobservable. Every fetch above
  // settles a failure as null, so if chessdb started failing 100% tomorrow,
  // nothing in the logs would change, the prompt would just quietly get
  // thinner, and the measured +70pp tactical-accuracy result could not be
  // re-verified. (`stage9_async_grounding_fetched` covers only the VALIDATOR
  // path — a different set of fetches.)
  //
  // A null here is not necessarily a failure: it is also how "no data for this
  // FEN" and "source not configured" arrive. The point is that a *change* in
  // the ok/null ratio becomes visible at all. `slowestOkMs` (the slowest fetch
  // that answered) is what the prompt's wait (TURN1_GROUNDING_WAIT_MS) is set
  // from: `slowestMs` counts timeouts too, so a hung source reads as its abort. `requested` counts every
  // position the build wanted, so a source the breaker skipped shows as asked
  // and unanswered, with `circuitOpen` saying why.
  const allSettled: Promise<void> = Promise.all(fanOuts.map((src) => sourceSettled<unknown>(src))).then(() => {
    const fetchWaitMs = Date.now() - tFetchStart;
    const hitRate = (src: SourceFanOut<unknown>) => ({
      requested: src.wanted.size,
      ok: Array.from(src.settled.values()).filter((v) => v != null).length,
    });
    log.info("contract_grounding_fetched", {
      fetchWaitMs,
      plies: unionPlies.length,
      chessdb: hitRate(chessdbFanOut),
      lc0: hitRate(lc0FanOut),
      maia: hitRate(maiaFanOut),
      slowestMs: {
        chessdb: chessdbFanOut.slowestMs,
        lc0: lc0FanOut.slowestMs,
        maia: maiaFanOut.slowestMs,
      },
      slowestOkMs: {
        chessdb: chessdbFanOut.slowestOkMs,
        lc0: lc0FanOut.slowestOkMs,
        maia: maiaFanOut.slowestOkMs,
      },
      ...(opts.breaker
        ? {
            circuitOpen: {
              chessdb: chessdbFanOut.open ? chessdbFanOut.wanted.size : 0,
              lc0: lc0FanOut.open ? lc0FanOut.wanted.size : 0,
              maia: maiaFanOut.open ? maiaFanOut.wanted.size : 0,
            },
          }
        : {}),
    });
  });

  const snapshot = (): ContractGrounding => ({
    chessdb: new Map(chessdbFanOut.settled),
    lc0: new Map(lc0FanOut.settled),
    maia: new Map(maiaFanOut.settled),
    complete: fanOuts.every((src) => src.settled.size === src.pending.length),
  });

  // --- The grounding-free half, one insight at a time ---
  let cursor = 0;
  const prepared: Array<PreparedInsight | null> = [];
  let halfCpuMs = 0;
  let finals: {
    finalAnnotation: string | null;
    finalRelational: RelationalFactsBlock | null;
    intent: CoachContract["intent"] | null;
  } | null = null;

  const prepareAt = (ply: number): PreparedInsight | null => {
    const plan = plans.get(ply)!;
    const evalBefore = positions?.[ply];
    // Both legacy loops guaranteed lines[0] exists for selected plies.
    if (!evalBefore?.lines?.[0]) return null;
    const lines = evalBefore.lines;
    const topRank = topRankByPly.get(ply) ?? null;
    const intelRank = intelRankByPly.get(ply) ?? null;
    const topCand = selection.topMistakes.find((m) => m.ply === ply);
    const intelCand = selection.intelligenceTop3.find((m) => m.ply === ply);
    const cand = topCand ?? intelCand!;
    const playedSan = moveHistory[ply];
    const fenBefore = plan.fenBefore;
    const fenAfter = topCand?.fenAfter ?? fens[ply + 1];

    const bestPvLine = lines[0];
    const bestPvSan = bestPvLine?.pv ? convertPvToSan(fenBefore, bestPvLine.pv) : [];
    const motifs = playedSan ? detectMotifs(fenBefore, playedSan) : [];
    // PRECISION PACK fix 4 — referee LICENSE POOL only (never rendered/voted/
    // serialized): static fenAfter scan + first 2 plies of each PV. See
    // motifScope.ts. Computed AFTER `motifs` so the voter inputs are
    // byte-identical to legacy.
    let motifLicense: AnyMotif[] = [];
    try {
      motifLicense = buildMotifLicense({
        fenBefore,
        fenAfter,
        pvSans: lines.map((l) => (l.pv && l.pv.length > 0 ? convertPvToSan(fenBefore, l.pv) : [])),
        // ROUND 2: the game's own next 2 plies — real continuation tactics
        // ("Nxf7 with a strong fork" narrating what actually happened next)
        // are contract-known facts, not fabrications (v2 spans #1/#3).
        gameSans: moveHistory.slice(ply + 1, ply + 3),
      });
    } catch {
      motifLicense = [];
    }

    const movedFrom = new Set(fromSquares.slice(0, ply));
    const lineFacts = buildLineFacts(topRank ? `M${topRank}` : `I${intelRank}`, fenBefore, playedSan, lines, movedFrom);
    // What the game actually did from here: the played move and the next few
    // real plies, told the same way as the engine lines ("after your Ng4,
    // White played d6 and your knight was left en prise"). Same detectors,
    // same ledger, cite token <P>.game.s<j>.
    const gameStory = safeLineStory(fenBefore, moveHistory.slice(ply, ply + STORY_MAX_PLIES), movedFrom);
    // Story motifs deliberately do NOT join motifLicense: a fork six plies
    // down a sideline must not license the word "fork" anywhere in the card.
    // The referee licenses them sentence-by-sentence instead, through the
    // story citation the sentence carries (refereeChecks.storyLicensesKeyword).

    // Mate-flattened numbers + drop, exactly as the legacy loops computed.
    // The inline fallback used to read `cp ?? 0` on both sides — the same
    // "unscored means 0.00" substitution flattenEval carried (C6 covered only
    // the null-mate half). selectInsights now skips unscored plies, so for a
    // selected candidate these fallbacks should never see a scoreless line;
    // if one arrives anyway, declining the card beats inventing its eval.
    const cpBeforeFlat = topCand?.cpBeforeFlat ?? flattenEval(lines[0]);
    const evalAfterLine = positions?.[ply + 1]?.lines?.[0];
    const cpAfterFlat =
      topCand?.cpAfterFlat ?? (evalAfterLine ? flattenEval(evalAfterLine) : null);
    if (cpBeforeFlat === null || cpAfterFlat === null) {
      log.info("contract_unscored_ply_skipped", { ply });
      return null;
    }
    const dropCp = cand.dropCp;

    // TOP MISTAKES branch point: best line vs the line starting with the
    // played move (legacy finds it by converting each line's FIRST uci).
    let branchPoint: BranchPointFact | null = null;
    if (topRank !== null) {
      const playedPvLine = lines.find((l) => {
        const first = l.pv?.[0] ? convertPvToSan(fenBefore, [l.pv[0]])[0] : undefined;
        return first === playedSan;
      });
      if (bestPvSan.length > 0 && playedPvLine?.pv) {
        const playedPvSan = convertPvToSan(fenBefore, playedPvLine.pv);
        const branchIdx = findBranchPoint(bestPvSan, playedPvSan);
        if (branchIdx < Math.min(bestPvSan.length, playedPvSan.length)) {
          branchPoint = {
            atPly: branchIdx,
            sharedSan: bestPvSan.slice(0, branchIdx),
            bestContinues: bestPvSan[branchIdx],
            playedGoes: playedPvSan[branchIdx],
          };
        }
      }
    }

    // Intelligence-layer facts (only computed for intel-selected plies —
    // legacy computed them nowhere else).
    let intelBranchPoint: IntelBranchPointFact | null = null;
    const concepts: ConceptFact[] = [];
    let engineIdea: string | null = null;
    let relational: RelationalFactsBlock | null = null;
    let featureDelta: PositionFeatureDelta | null = null;
    let threats: ThreatNode[] | null = null;
    if (intelRank !== null) {
      if (lines.length >= 2 && bestPvSan.length > 0) {
        const pv2San = convertPvToSan(fenBefore, lines[1].pv ?? []);
        const branchIdx = findBranchPoint(bestPvSan, pv2San);
        intelBranchPoint = {
          sharedCount: branchIdx,
          sharedSan: bestPvSan.slice(0, branchIdx),
          bestContinues: bestPvSan[branchIdx] ?? null,
          altContinues: pv2San[branchIdx] ?? null,
        };
      }
      // buildConceptLayer, structured (renderer re-applies the template)
      const uci = sanPvToUci(fenBefore, bestPvSan);
      if (uci.length > 0) {
        const hits = detectConcepts({ fen: fenBefore, solutionUci: uci });
        for (const h of hits.slice(0, 3)) {
          const c = getConcept(h.conceptId);
          if (!c) continue;
          concepts.push({
            id: h.conceptId,
            name: c.name,
            tier: c.tier,
            confidence: h.confidence,
            definition: c.definition,
            evidence: h.evidence,
          });
        }
      }
      engineIdea = buildExplanationSeed(fenBefore, bestPvSan, cand.moveNumber, ply % 2 === 0);
      try {
        relational = buildRelationalFacts(fenBefore);
      } catch {
        relational = null;
      }
      // Teaching spine inputs: one try/catch around BOTH computations, like
      // the legacy single try around buildTeachingSpine.
      try {
        const spineFenAfter = fens[ply + 1];
        const delta = compute_feature_delta(fenBefore, spineFenAfter, {
          pv: lines[0].pv ?? [],
        });
        const threatNodes = buildThreatTree(fenBefore, 2);
        featureDelta = delta;
        threats = threatNodes;
      } catch {
        featureDelta = null;
        threats = null;
      }
    }

    return {
      plan,
      voterInputs: {
        motifs,
        bestMoveSan: bestPvSan[0] ?? null,
        stockfishEvalCp: lines[0]?.cp ?? null,
        stockfishBestMoveMate: lines[0]?.mate ?? null,
      },
      fields: {
        factIdPrefix: topRank ? `M${topRank}` : `I${intelRank}`,
        ply,
        moveNumber: cand.moveNumber,
        color: ply % 2 === 0 ? "w" : "b",
        colorName: cand.colorName,
        playedSan,
        bestSan: topCand ? topCand.bestSan : null,
        classification: dropCp >= 300 ? "blunder" : dropCp >= 150 ? "mistake" : "inaccuracy",
        severityDropPawns: dropCp / 100,
        severityDropCp: dropCp,
        cpBeforeFlat,
        cpAfterFlat,
        fenBefore,
        fenAfter,
        evalBefore: evalFactFromLine(lines[0]),
        evalAfter: evalAfterLine ? evalFactFromLine(evalAfterLine) : evalFactFromLine(undefined),
        lines: lineFacts,
        gameStory,
        branchPoint,
        intelBranchPoint,
        changeDescription: describeMoveChange(fenBefore, playedSan),
        motifs,
        motifLicense,
        sayables: buildSayables(motifs, relational),
        concepts,
        engineIdea,
        relational,
        featureDelta,
        threats,
        pieceRoleChanges: [],
        topMistakeRank: topRank,
        intelligenceRank: intelRank,
      },
    };
  };

  const step = () => {
    const t = Date.now();
    prepared.push(prepareAt(unionPlies[cursor]));
    cursor += 1;
    halfCpuMs += Date.now() - t;
  };

  const finishHalf = () => {
    if (finals) return;
    const t = Date.now();
    // --- Final-position facts ---
    let finalAnnotation: string | null = null;
    try {
      finalAnnotation = annotationToPromptContext(annotatePosition(finalFen));
    } catch {
      finalAnnotation = null;
    }
    let finalRelational: RelationalFactsBlock | null = null;
    try {
      finalRelational = buildRelationalFacts(finalFen);
    } catch {
      finalRelational = null;
    }
    // INTENT FACTS — dark, additive, and gated on INTENT_FACTS_ENABLED.
    //
    // Attached for telemetry and offline comparison only: serializeForVerbalizer
    // strips `intent`, so the verbalizer prompt, its cache prefix, and every
    // byte-equality snapshot are identical whether this ran or not. Computed for
    // carded plies alone (Tier 0 — no extra engine work), because a whole-game
    // sweep would be waste and the null-move tier is not wired yet.
    let intent: CoachContract["intent"] | null = null;
    const pliesCarded = prepared.filter((p): p is PreparedInsight => p !== null).map((p) => p.fields.ply);
    if (isIntentFactsEnabled() && gameEval && pliesCarded.length) {
      const facts = intentFactsForPlies({
        gameEval: gameEval as unknown as GameEval,
        moves: moveHistory,
        plies: pliesCarded,
      });
      if (facts.length) intent = facts;
    }
    finals = { finalAnnotation, finalRelational, intent };
    halfCpuMs += Date.now() - t;
  };

  const completeHalf = () => {
    while (cursor < unionPlies.length) step();
    finishHalf();
  };

  let preparing: Promise<void> | null = null;
  const prepare = (): Promise<void> => {
    preparing ??= (async () => {
      while (cursor < unionPlies.length) {
        step();
        if (cursor < unionPlies.length) await yieldToEventLoop();
      }
      finishHalf();
    })();
    return preparing;
  };

  const contractId = generateContextId(
    moveHistory,
    identity?.fen,
    identity?.playerColor ?? (playerColor || "w"),
    uid,
  );

  const ground = (g: ContractGrounding): CoachContract => {
    completeHalf();
    const tg = Date.now();
    const insights: InsightContract[] = [];
    for (const p of prepared) {
      if (!p) continue;
      const { plan, fields: f } = p;
      const chessdbResult = g.chessdb.get(plan.fenBefore) ?? null;
      const lc0Result = plan.lc0Gate ? (g.lc0.get(plan.fenBefore) ?? null) : null;
      const maiaResult = plan.maiaGate ? (g.maia.get(`${plan.fenBefore}::${plan.bestUci}`) ?? null) : null;
      const voter = compileVoterResult({
        motifs: p.voterInputs.motifs,
        chessdbResult,
        lc0Result,
        maiaResult,
        bestMoveSan: p.voterInputs.bestMoveSan,
        stockfishEvalCp: p.voterInputs.stockfishEvalCp,
        stockfishBestMoveMate: p.voterInputs.stockfishBestMoveMate,
      });
      // Key order is the serialized order: keep it exactly as it was.
      insights.push({
        factIdPrefix: f.factIdPrefix,
        ply: f.ply,
        moveNumber: f.moveNumber,
        color: f.color,
        colorName: f.colorName,
        playedSan: f.playedSan,
        bestSan: f.bestSan,
        classification: f.classification,
        severityDropPawns: f.severityDropPawns,
        severityDropCp: f.severityDropCp,
        cpBeforeFlat: f.cpBeforeFlat,
        cpAfterFlat: f.cpAfterFlat,
        fenBefore: f.fenBefore,
        fenAfter: f.fenAfter,
        evalBefore: f.evalBefore,
        evalAfter: f.evalAfter,
        lines: f.lines,
        gameStory: f.gameStory,
        branchPoint: f.branchPoint,
        intelBranchPoint: f.intelBranchPoint,
        changeDescription: f.changeDescription,
        motifs: f.motifs,
        motifLicense: f.motifLicense,
        allowedTacticalKeywords: voter.allowedTacticalKeywords,
        voterConfidence: voter.confidence,
        positionConfidence: voter.positionConfidence,
        groundingContext: voter.groundingContext,
        sayables: f.sayables,
        concepts: f.concepts,
        engineIdea: f.engineIdea,
        relational: f.relational,
        featureDelta: f.featureDelta,
        threats: f.threats,
        pieceRoleChanges: [],
        chessdb: degradeChessdb(chessdbResult),
        syzygy: SYZYGY_NOT_APPLICABLE,
        lc0: degradeLc0(lc0Result, plan.lc0Gate, plan.sfCp),
        visibility: degradeVisibility(maiaResult, plan.maiaGate),
        topMistakeRank: f.topMistakeRank,
        intelligenceRank: f.intelligenceRank,
      });
    }

    const contract: CoachContract = {
      version: CONTRACT_VERSION,
      // PR-CI-2 identity fix: computed with the route's request-body fen and
      // its playerColor || "w" defaulting so contractId ≡ the route contextId
      // exactly (see BuildCoachContractArgs.identity).
      contractId,
      builtAtMs: t0,
      buildMs: 0, // set below so the field reflects the CPU work
      game: {
        pgnHeaders: { ...pgnHeaders },
        playerColor,
        moveCount: totalFullMoves,
        totalHalfMoves,
        replayedPlies,
        historyTruncated,
        resultText,
        finalFen,
        finalMaterial,
        skillLevel: userRating
          ? userRating < 1000
            ? "beginner"
            : userRating < 1600
              ? "intermediate"
              : "advanced"
          : "intermediate",
        userRating: userRating ?? null,
        username: username ?? null,
        accuracy: gameEval?.accuracy ?? null,
        estimatedElo: gameEval?.estimatedElo ?? null,
        hasGameEval,
        moveHistory,
      },
      evalIntegrity,
      insights,
      moveTable: moveTable.slice(),
      finalAnnotation: finals!.finalAnnotation,
      finalRelational: finals!.finalRelational,
      persona: { personalityId: null, ...(username ? { username } : {}) },
    };
    if (finals!.intent) contract.intent = finals!.intent.slice();

    // Plan §5 gate definition: contract build time is CPU-only. The network
    // wait for the grounding fetches is excluded (it exists on the legacy
    // path too), and so is any time the half spent yielding to the loop.
    contract.buildMs = beginCpuMs + halfCpuMs + (Date.now() - tg);
    return contract;
  };

  const within = (msFromLaunch: number): Promise<ContractGrounding> =>
    new Promise((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer !== null) clearTimeout(timer);
        resolve(snapshot());
      };
      allSettled.then(finish, finish);
      if (Number.isFinite(msFromLaunch)) {
        timer = setTimeout(finish, Math.max(0, tFetchStart + msFromLaunch - Date.now()));
      }
    });

  return { launchedAtMs: tFetchStart, launched, within, prepare, ground };
}

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
 */
import { Chess } from "chess.js";
import { annotatePosition, annotationToPromptContext } from "@/lib/positionAnnotator";
import { detectMotifs } from "@/lib/tactics";
import { buildLineStory, type LineStory } from "./lineStory";
import { logger } from "@/lib/logging";

const log = logger.child({ module: "contract-builder" });
import type { AnyMotif } from "@/lib/tactics";
import { buildMotifLicense } from "./motifScope";
import { queryChessdb, type ChessdbResult } from "@/lib/grounding/chessdb";
import { compileVoterResult } from "@/lib/grounding/voter";
import { queryLc0, shouldCallLc0, lc0AgreesWithSf, __isLc0Configured, type Lc0Result } from "@/lib/grounding/lc0";
import {
  queryMaiaAtRating,
  shouldCallMaia,
  probToVisibility,
  __isMaiaConfigured,
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
  findBranchPoint,
  getFenAtHalfMove,
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


// ── The builder ─────────────────────────────────────────────────────────────
export async function buildCoachContract(args: BuildCoachContractArgs): Promise<CoachContract> {
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
    const fenBefore = getFenAtHalfMove(moveHistory, i);
    const fenAfter = getFenAtHalfMove(moveHistory, i + 1);
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

  // --- ONE Promise.all for every grounding fetch, deduped ---
  // chessdb dedupes by FEN; Lc0 by FEN (gate inputs are identical for a given
  // ply's evalBefore, and identical FENs from repetition share the position);
  // Maia by FEN+bestUci (the rating is constant per request).
  const chessdbByFen = new Map<string, Promise<ChessdbResult | null>>();
  const lc0ByFen = new Map<string, Promise<Lc0Result | null>>();
  const maiaByKey = new Map<string, Promise<MaiaProbResult | null>>();

  interface PlyFetchPlan {
    ply: number;
    fenBefore: string;
    sfCp: number | null;
    bestUci: string | null;
    lc0Gate: boolean;
    maiaGate: boolean;
  }
  const plans = new Map<number, PlyFetchPlan>();

  for (const ply of unionPlies) {
    const evalBefore = positions?.[ply];
    const fenBefore = getFenAtHalfMove(moveHistory, ply);
    const sfCp = evalBefore?.lines?.[0]?.cp ?? null;
    const bestUci = evalBefore?.lines?.[0]?.pv?.[0] ?? null;
    const lc0Gate = shouldCallLc0(sfCp, evalBefore?.lines ?? []);
    const maiaGate = shouldCallMaia(userRating, bestUci);
    plans.set(ply, { ply, fenBefore, sfCp, bestUci, lc0Gate, maiaGate });

    if (!chessdbByFen.has(fenBefore)) {
      chessdbByFen.set(fenBefore, queryChessdb(fenBefore).catch(() => null));
    }
    if (lc0Gate && !lc0ByFen.has(fenBefore)) {
      lc0ByFen.set(fenBefore, queryLc0(fenBefore).catch(() => null));
    }
    if (maiaGate) {
      const key = `${fenBefore}::${bestUci}`;
      if (!maiaByKey.has(key)) {
        maiaByKey.set(key, queryMaiaAtRating(fenBefore, userRating!, bestUci!).catch(() => null));
      }
    }
  }

  const tFetchStart = Date.now();
  const [chessdbSettled, lc0Settled, maiaSettled] = await Promise.all([
    Promise.all(Array.from(chessdbByFen.values())),
    Promise.all(Array.from(lc0ByFen.values())),
    Promise.all(Array.from(maiaByKey.values())),
  ]);
  const fetchWaitMs = Date.now() - tFetchStart;

  // T4 (SILENT_SUBSTITUTION_HANDOFF §4): until this line existed, the
  // prompt-side grounding path was completely unobservable. Every fetch above
  // is `.catch(() => null)`, so if chessdb started failing 100% tomorrow,
  // nothing in the logs would change, the prompt would just quietly get
  // thinner, and the measured +70pp tactical-accuracy result could not be
  // re-verified. (`stage9_async_grounding_fetched` covers only the VALIDATOR
  // path — a different set of fetches.)
  //
  // A null here is not necessarily a failure: it is also how "no data for this
  // FEN" and "source not configured" arrive. The point is that a *change* in
  // the ok/null ratio becomes visible at all.
  const hitRate = (vals: Array<unknown>) => ({
    requested: vals.length,
    ok: vals.filter((v) => v != null).length,
  });
  log.info("contract_grounding_fetched", {
    fetchWaitMs,
    plies: unionPlies.length,
    chessdb: hitRate(chessdbSettled),
    lc0: hitRate(lc0Settled),
    maia: hitRate(maiaSettled),
  });

  // --- Build each insight ---
  const insights: InsightContract[] = [];
  for (const ply of unionPlies) {
    const plan = plans.get(ply)!;
    const evalBefore = positions?.[ply];
    // Both legacy loops guaranteed lines[0] exists for selected plies.
    if (!evalBefore?.lines?.[0]) continue;
    const lines = evalBefore.lines;
    const topRank = topRankByPly.get(ply) ?? null;
    const intelRank = intelRankByPly.get(ply) ?? null;
    const topCand = selection.topMistakes.find((m) => m.ply === ply);
    const intelCand = selection.intelligenceTop3.find((m) => m.ply === ply);
    const cand = topCand ?? intelCand!;
    const playedSan = moveHistory[ply];
    const fenBefore = plan.fenBefore;
    const fenAfter = topCand?.fenAfter ?? getFenAtHalfMove(moveHistory, ply + 1);

    const chessdbResult = (await chessdbByFen.get(fenBefore)!) ?? null;
    const lc0Result = plan.lc0Gate ? ((await lc0ByFen.get(fenBefore)!) ?? null) : null;
    const maiaResult = plan.maiaGate
      ? ((await maiaByKey.get(`${fenBefore}::${plan.bestUci}`)!) ?? null)
      : null;

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
    const voter = compileVoterResult({
      motifs,
      chessdbResult,
      lc0Result,
      maiaResult,
      bestMoveSan: bestPvSan[0] ?? null,
      stockfishEvalCp: lines[0]?.cp ?? null,
      stockfishBestMoveMate: lines[0]?.mate ?? null,
    });

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
      continue;
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
        const spineFenAfter = getFenAtHalfMove(moveHistory, ply + 1);
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

    insights.push({
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
      allowedTacticalKeywords: voter.allowedTacticalKeywords,
      voterConfidence: voter.confidence,
      positionConfidence: voter.positionConfidence,
      groundingContext: voter.groundingContext,
      sayables: buildSayables(motifs, relational),
      concepts,
      engineIdea,
      relational,
      featureDelta,
      threats,
      pieceRoleChanges: [],
      chessdb: degradeChessdb(chessdbResult),
      syzygy: SYZYGY_NOT_APPLICABLE,
      lc0: degradeLc0(lc0Result, plan.lc0Gate, plan.sfCp),
      visibility: degradeVisibility(maiaResult, plan.maiaGate),
      topMistakeRank: topRank,
      intelligenceRank: intelRank,
    });
  }

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

  const contract: CoachContract = {
    version: CONTRACT_VERSION,
    // PR-CI-2 identity fix: computed with the route's request-body fen and
    // its playerColor || "w" defaulting so contractId ≡ the route contextId
    // exactly (see BuildCoachContractArgs.identity).
    contractId: generateContextId(
      moveHistory,
      identity?.fen,
      identity?.playerColor ?? (playerColor || "w"),
      uid,
    ),
    builtAtMs: t0,
    buildMs: 0, // patched below so the field reflects the full build
    game: {
      pgnHeaders,
      playerColor,
      moveCount: totalFullMoves,
      totalHalfMoves,
      replayedPlies,
      historyTruncated,
      resultText,
      finalFen,
      finalMaterial: getMaterialBalance(game),
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
    moveTable,
    finalAnnotation,
    finalRelational,
    persona: { personalityId: null, ...(username ? { username } : {}) },
  };
  // INTENT FACTS — dark, additive, and gated on INTENT_FACTS_ENABLED.
  //
  // Attached for telemetry and offline comparison only: serializeForVerbalizer
  // strips `intent`, so the verbalizer prompt, its cache prefix, and every
  // byte-equality snapshot are identical whether this ran or not. Computed for
  // carded plies alone (Tier 0 — no extra engine work), because a whole-game
  // sweep would be waste and the null-move tier is not wired yet.
  if (isIntentFactsEnabled() && gameEval && insights.length) {
    const intent = intentFactsForPlies({
      gameEval: gameEval as unknown as GameEval,
      moves: moveHistory,
      plies: insights.map((i) => i.ply),
    });
    if (intent.length) contract.intent = intent;
  }

  // Plan §5 gate definition: contract build time is CPU-only, measured OVER
  // the shared grounding fetches (their network wait is excluded — it exists
  // on the legacy path too and is now strictly smaller thanks to the dedup).
  contract.buildMs = Date.now() - t0 - fetchWaitMs;
  return contract;
}

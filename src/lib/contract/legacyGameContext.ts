/**
 * buildGameContext — the legacy game-review prompt builder, re-plumbed
 * (PR-CI-1 commit 2) to render FROM a typed CoachContract:
 *
 *     buildCoachContract(...)  →  renderLegacyPrompt(contract)
 *
 * Output is byte-identical to the pre-contract implementation — pinned by
 * __tests__/legacyGameContext.snapshot.test.ts (commit-1 snapshots, NOT
 * regenerated in commit 2). The only behavior change is performance: all
 * per-insight grounding fetches now launch in one deduped Promise.all
 * (see builder.ts).
 *
 * WHY THIS LIVES OUTSIDE route.ts (commit-1 deviation, kept): Next.js 15
 * type-checks app-route files against an allowlist of export fields, so
 * buildGameContext cannot be exported from route.ts ("buildGameContext is
 * not a valid Route export field" at next build). The route imports it from
 * here instead.
 *
 * CONTRACT_SHADOW (parseBoolEnv, memoized via getContractEnv): when on, one
 * structured log line per build — {contractId, buildMs, insightCount,
 * contractBytes, evalIntegrity}. Flag off ⇒ zero new log output.
 *
 * This module also re-exports the chess utilities + client input types for
 * the route (moved here from route.ts in commit 1; the utilities now live in
 * chessFormat.ts, the input types + zod sanity schema in gameEvalSchema.ts).
 */
import { logger } from "@/lib/logging";
import { getContractEnv } from "@/env";
import {
  beginCoachContract,
  buildCoachContract,
  TURN1_GROUNDING_SETTLE_CAP_MS,
  type ContractGrounding,
  type PendingCoachContract,
} from "./builder";
import { renderLegacyPrompt, serializeForVerbalizer } from "./serialize";
import type { CoachContract } from "./types";
import type { GameEvalInput, GameHeadersInput } from "./gameEvalSchema";

export {
  buildPgnFromMoves,
  convertPvToSan,
  getFenAtHalfMove,
  getMaterialBalance,
  sanPvToUci,
  uciToSan,
} from "./chessFormat";
export type { GameEvalInput, GameHeadersInput, PositionEvalInput } from "./gameEvalSchema";

// Same child-logger shape the route uses (the logger accepts {module} only);
// "contract" scopes the shadow line without colliding with the route's child.
const log = logger.child({ module: "contract" });

/**
 * Build a rich move-by-move game context string from the move history + Stockfish evals.
 * This gives the LLM everything it needs to analyze the game.
 *
 * `uid` (new, PR-CI-1) feeds the contract's contractId (=== the route's
 * contextId identity, per plan §2); defaulted so pre-existing call sites
 * compile unchanged.
 *
 * `identity` (new, PR-CI-2) carries the route's request-body `fen` and its
 * `playerColor || "w"` defaulting so contractId ≡ the route's contextId
 * exactly. Identity-only: never read by the renderer (snapshots pin this).
 */
export async function buildGameContext(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string,
  username?: string,
  userRating?: number,
  gameHeaders?: GameHeadersInput,
  uid?: string,
  identity?: { fen?: string; playerColor?: string },
): Promise<string> {
  const { prompt } = await buildGameContextWithContract(
    moveHistory,
    gameEval,
    playerColor,
    username,
    userRating,
    gameHeaders,
    uid,
    identity,
  );
  return prompt;
}

/**
 * PR-CI-3: same build, but the contract rides along for the route's shadow
 * referee (CONTRACT_REFEREE_SHADOW). The prompt string is byte-identical to
 * buildGameContext (it IS buildGameContext — one implementation).
 *
 * `early` (pathway 4.8a, COACH_TURN1_EARLY_STREAM): the grounding fetches go
 * through the breaker, the grounding-free half is computed while they are in
 * flight, and the prompt and `contract` are built from what has answered
 * `early.waitMs` after launch. A source still in flight reads as unavailable,
 * as its timeout would. `refereeContract` is the contract over every result
 * that lands within TURN1_GROUNDING_SETTLE_CAP_MS of launch, for the enforced
 * stream's referee. It never rejects, and when nothing was withheld it is
 * `contract` itself. Without `early` the build is unchanged.
 */
export async function buildGameContextWithContract(
  moveHistory: string[],
  gameEval: GameEvalInput | undefined,
  playerColor: string,
  username?: string,
  userRating?: number,
  gameHeaders?: GameHeadersInput,
  uid?: string,
  identity?: { fen?: string; playerColor?: string },
  early?: { waitMs: number }
): Promise<{
  prompt: string;
  contract: CoachContract;
  refereeContract?: Promise<CoachContract>;
}> {
  const args = {
    moveHistory,
    gameEval,
    playerColor,
    username,
    userRating,
    gameHeaders,
    uid,
    identity,
  };
  let contract: CoachContract;
  let refereeContract: Promise<CoachContract> | undefined;
  if (early) {
    const pending = beginCoachContract(args, { breaker: true });
    await pending.prepare();
    const earlyG = await pending.within(early.waitMs);
    const promptWaitMs = Date.now() - pending.launchedAtMs;
    contract = pending.ground(earlyG);
    log.info("contract_grounding_prompt", {
      contractId: contract.contractId,
      promptWaitMs,
      complete: earlyG.complete,
      withheld: withheldCounts(pending, earlyG),
    });
    const promptContract = contract;
    refereeContract = earlyG.complete
      ? Promise.resolve(promptContract)
      : pending
          .within(TURN1_GROUNDING_SETTLE_CAP_MS)
          .then((g) => pending.ground(g))
          .catch(() => promptContract);
  } else {
    contract = await buildCoachContract(args);
  }

  if (getContractEnv().shadowEnabled) {
    log.info("contract shadow build", {
      contractId: contract.contractId,
      buildMs: contract.buildMs,
      insightCount: contract.insights.length,
      contractBytes: Buffer.byteLength(serializeForVerbalizer(contract), "utf8"),
      evalIntegrity: contract.evalIntegrity,
    });
  }

  return {
    prompt: renderLegacyPrompt(contract),
    contract,
    ...(refereeContract ? { refereeContract } : {}),
  };
}

/** Fetches still in flight when the prompt's snapshot was taken, per source. */
function withheldCounts(
  pending: PendingCoachContract,
  g: ContractGrounding
): { chessdb: number; lc0: number; maia: number } {
  return {
    chessdb: pending.launched.chessdb - g.chessdb.size,
    lc0: pending.launched.lc0 - g.lc0.size,
    maia: pending.launched.maia - g.maia.size,
  };
}

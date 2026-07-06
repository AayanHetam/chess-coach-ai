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
import { buildCoachContract } from "./builder";
import { renderLegacyPrompt, serializeForVerbalizer } from "./serialize";
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
  const contract = await buildCoachContract({
    moveHistory,
    gameEval,
    playerColor,
    username,
    userRating,
    gameHeaders,
    uid,
    identity,
  });

  if (getContractEnv().shadowEnabled) {
    log.info("contract shadow build", {
      contractId: contract.contractId,
      buildMs: contract.buildMs,
      insightCount: contract.insights.length,
      contractBytes: Buffer.byteLength(serializeForVerbalizer(contract), "utf8"),
      evalIntegrity: contract.evalIntegrity,
    });
  }

  return renderLegacyPrompt(contract);
}

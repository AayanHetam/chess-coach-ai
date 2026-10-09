/**
 * The real game fixtures (src/lib/contract/__tests__/fixtures-real) and the
 * compact contract the follow-up referee is given for one, built the way
 * followup_referee_replay.ts has always built it: no identity, the served
 * cards the verbalizer would pick.
 *
 * The contract builder may ask chessdb for an outcome. A caller that must
 * stay offline stubs it first (`__setFetchForTesting` in lib/grounding/chessdb).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { PositionEval } from "@/types/eval";
import type { CompactContract } from "@/lib/contract/followUp";

export interface RealFixture {
  moveHistory: string[];
  gameEval: { positions: PositionEval[] };
  playerColor?: "w" | "b";
  username?: string;
  userRating?: number;
  gameHeaders?: Record<string, string>;
}

/** The fixture of that name, or null when there is none. */
export function loadRealFixture(
  repoRoot: string,
  name: string
): RealFixture | null {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) return null;
  const file = path.join(
    repoRoot,
    "src/lib/contract/__tests__/fixtures-real",
    `${name}.json`
  );
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")) as RealFixture;
}

/**
 * The compact contract for a fixture. `playerColor` overrides the
 * fixture's own side, for a turn asked as the other player.
 */
export async function compactForFixture(
  fx: RealFixture,
  playerColor?: "w" | "b"
): Promise<CompactContract> {
  const { buildCoachContract } = await import("@/lib/contract/builder");
  const { toCompactContract } = await import("@/lib/contract/followUp");
  const { selectCardInsights } = await import("@/lib/prompts/verbalizerPrompt");
  const contract = await buildCoachContract({
    moveHistory: fx.moveHistory,
    gameEval: fx.gameEval as never,
    playerColor: (playerColor ?? fx.playerColor) as string,
    username: fx.username,
    userRating: fx.userRating,
    gameHeaders: fx.gameHeaders,
  });
  return toCompactContract(
    contract,
    selectCardInsights(contract).map((i) => i.factIdPrefix)
  );
}

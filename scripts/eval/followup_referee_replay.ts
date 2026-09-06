/**
 * Replay the follow-up referee over saved chat answers — $0.
 *
 * followup_story_probe.ts saved eight real fast-tier answers (two fixtures ×
 * two questions × with/without line stories). This rebuilds each fixture's
 * compact contract and runs refereeFollowUp over every answer, printing what
 * would have been dropped and why. The "without stories" answers are the ones
 * that carried chess-false sentences; the referee should cut those, and cut
 * little or nothing from the "with stories" answers.
 *
 * Usage: npx tsx scripts/eval/followup_referee_replay.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
process.env.LC0_API_URL = ""; process.env.MAIA_API_URL = "";

(async () => {
  const { buildCoachContract } = await import("@/lib/contract/builder");
  const { toCompactContract } = await import("@/lib/contract/followUp");
  const { refereeFollowUp } = await import("@/lib/contract/followUpReferee");
  const { selectCardInsights } = await import("@/lib/prompts/verbalizerPrompt");
  const { getFenAtHalfMove } = await import("@/lib/contract/chessFormat");
  const { __setFetchForTesting } = await import("@/lib/grounding/chessdb");
  __setFetchForTesting((() => Promise.reject(new Error("offline"))) as never);

  const saved = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/eval/results/followup-story-probe.json"), "utf8"));
  const compacts = new Map<string, { compact: ReturnType<typeof toCompactContract>; fen: string; moves: string[] }>();
  const summary: Record<string, { sentences: number; dropped: number }> = { with: { sentences: 0, dropped: 0 }, without: { sentences: 0, dropped: 0 } };
  for (const row of saved.results) {
    if (!compacts.has(row.fixture)) {
      const fx = JSON.parse(fs.readFileSync(path.join(process.cwd(), `src/lib/contract/__tests__/fixtures-real/${row.fixture}.json`), "utf8"));
      const contract = await buildCoachContract({ moveHistory: fx.moveHistory, gameEval: fx.gameEval, playerColor: fx.playerColor, username: fx.username, userRating: fx.userRating, gameHeaders: fx.gameHeaders });
      compacts.set(row.fixture, { compact: toCompactContract(contract, selectCardInsights(contract).map((i) => i.factIdPrefix)), fen: getFenAtHalfMove(fx.moveHistory, fx.moveHistory.length), moves: fx.moveHistory });
    }
    const { compact, fen, moves } = compacts.get(row.fixture)!;
    for (const arm of ["without", "with"] as const) {
      const r = refereeFollowUp({ reply: row[arm].answer, compact, activeFen: fen, moveHistory: moves });
      summary[arm].sentences += r.sentences; summary[arm].dropped += r.dropped.length;
      console.log(`\n===== ${row.fixture} | ${arm.toUpperCase()} stories | ${r.dropped.length}/${r.sentences} sentences dropped\nQ: ${row.question}`);
      for (const d of r.dropped) console.log(`  ✂ [${d.reason}] ${d.sentence}`);
    }
  }
  console.log(`\nSUMMARY without-stories: dropped ${summary.without.dropped}/${summary.without.sentences}  |  with-stories: dropped ${summary.with.dropped}/${summary.with.sentences}`);
})();

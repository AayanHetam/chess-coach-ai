/**
 * Follow-up line-story probe — does the chat coach explain a line better when
 * the compact contract carries what each move does?
 *
 * Builds the real contract for two fixtures, renders the follow-up block with
 * and without stories, asks the fast tier the two questions a student actually
 * asks after a review ("why was that bad?" / "what should I have played, and
 * why does it work?"), and writes both answers side by side with usage-priced
 * cost. A reading harness, not a gate: n is tiny and the judge is you.
 *
 * Usage: npx tsx scripts/eval/followup_story_probe.ts [--output p.json]
 */
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = process.cwd();
const OUT = (() => { const i = process.argv.indexOf("--output"); return i >= 0 ? process.argv[i + 1] : path.join(REPO_ROOT, "scripts/eval/results/followup-story-probe.json"); })();

function loadApiKey(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  for (const line of fs.readFileSync(path.join(REPO_ROOT, ".env.local"), "utf8").split("\n")) {
    if (line.startsWith("ANTHROPIC_API_KEY=")) return line.slice("ANTHROPIC_API_KEY=".length).trim().replace(/^['"]|['"]$/g, "");
  }
  throw new Error("no ANTHROPIC_API_KEY");
}

const CASES = [
  { fixture: "07_knight_fork", questions: ["Why was 8. Nc7+ a mistake? It forks the king and the rook.", "What should I have played on move 8 instead, and why does that actually work?"] },
  { fixture: "10_queenless_endgame", questions: ["Why is 18. Ne6 a blunder?", "What does the engine's idea on move 18 actually do? Walk me through the line."] },
];

(async () => {
  process.env.ANTHROPIC_API_KEY = loadApiKey();
  const { buildCoachContract } = await import("@/lib/contract/builder");
  const { toCompactContract, renderContractCompact } = await import("@/lib/contract/followUp");
  const { selectCardInsights } = await import("@/lib/prompts/verbalizerPrompt");
  const { getCoachChatSystemPromptParts } = await import("@/lib/prompts/coachChatPrompt");
  const { FOLLOWUP_REDUCED_GROUNDING_NOTE } = await import("@/lib/prompts/followupGrounding");
  const { callLLM } = await import("@/lib/llmProvider");
  const { estimateCostUSD } = await import("@/lib/llmPricing");
  const { getFenAtHalfMove } = await import("@/lib/contract/chessFormat");

  const results: unknown[] = [];
  let spend = 0;
  for (const c of CASES) {
    const fx = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, `src/lib/contract/__tests__/fixtures-real/${c.fixture}.json`), "utf8"));
    const contract = await buildCoachContract({ moveHistory: fx.moveHistory, gameEval: fx.gameEval, playerColor: fx.playerColor, username: fx.username, userRating: fx.userRating, gameHeaders: fx.gameHeaders, identity: { fen: getFenAtHalfMove(fx.moveHistory, fx.moveHistory.length), playerColor: fx.playerColor || "w" } });
    const served = selectCardInsights(contract).map((i) => i.factIdPrefix);
    const compact = toCompactContract(contract, served);
    const arms = {
      without: renderContractCompact({ ...compact, insights: compact.insights.map((i) => ({ ...i, bestLineStory: [], gameStory: [] })) }),
      with: renderContractCompact(compact),
    };
    const persona = getCoachChatSystemPromptParts({ personalityId: "friendly", userRating: fx.userRating ?? 1500, username: fx.username, playerColorName: fx.playerColor === "b" ? "black" : "white" });
    for (const q of c.questions) {
      const row: Record<string, unknown> = { fixture: c.fixture, question: q };
      for (const [arm, block] of Object.entries(arms)) {
        const res = await callLLM({
          tier: "fast",
          system: persona.stable,
          systemSuffix: `${persona.perUser}\n\n${block}\n\n${FOLLOWUP_REDUCED_GROUNDING_NOTE}`,
          cacheSystem: true,
          messages: [{ role: "user", content: q }],
          temperature: 0.7,
          maxTokens: 700,
        });
        const cost = estimateCostUSD({ model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens, cacheCreationTokens: res.cacheCreationTokens, cacheReadTokens: res.cacheReadTokens }) ?? 0;
        spend += cost;
        row[arm] = { answer: res.content, model: res.model, blockChars: block.length, costUsd: Number(cost.toFixed(4)) };
        console.log(`\n===== ${c.fixture} | ${arm.toUpperCase()} stories | block ${block.length} chars | $${cost.toFixed(4)}\nQ: ${q}\n${res.content}`);
      }
      results.push(row);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ date: new Date().toISOString().slice(0, 10), tier: "fast", spendUsd: Number(spend.toFixed(4)), results }, null, 2));
  console.log(`\nSPEND $${spend.toFixed(4)} — wrote ${OUT}`);
})();

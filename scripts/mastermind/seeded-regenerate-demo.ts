/**
 * Seeded regenerate demo — for Aayan's demos and the ISEF appendix.
 *
 * Run: npx tsx scripts/mastermind/seeded-regenerate-demo.ts
 *
 * What it does:
 * 1. Seeds a hallucinated LLM response containing both a qualitative eval
 *    mismatch ("Black is winning" when Stockfish says +0.7) and an invented
 *    feature citation ("you lost the bishop pair" with both bishops still on
 *    the board).
 * 2. Mocks the Haiku parser to classify those claims correctly (validator
 *    logic, not Haiku quality, is what's being demonstrated here).
 * 3. Mocks the LLM tier to return the bad response first, then a corrected
 *    response on retry.
 * 4. Runs runValidationPipeline.
 * 5. Pretty-prints the telemetry trace + final response + retry count + cost.
 *
 * No network. Pure deterministic demo.
 */
import { runValidationPipeline } from "@/lib/mastermind/validators";
import type { ParserCall } from "@/lib/mastermind/validators";
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const HALLUCINATED = "Black is winning here. You lost the bishop pair.";
const CORRECTED = "White holds a slight edge. The position is tense, but bishop play looks balanced.";

const featureDelta: PositionFeatureDelta = {
  fenBefore: STARTING_FEN,
  fenAfter: STARTING_FEN,
  resolutionFen: STARTING_FEN,
  resolutionReason: "quiescent",
  materialDelta: { white: 0, black: 0 },
  pawnStructureDelta: {
    doubledPawnsChange: { white: 0, black: 0 },
    isolatedPawnsChange: { white: 0, black: 0 },
    passedPawnsGained: { white: [], black: [] },
    passedPawnsLost: { white: [], black: [] },
    openFilesGained: [],
    openFilesLost: [],
    semiOpenFilesGained: { white: [], black: [] },
    semiOpenFilesLost: { white: [], black: [] },
  },
  kingSafetyDelta: { white: 0, black: 0 },
  pieceActivityDelta: { gainedActive: [], lostActive: [], newlyTrapped: [] },
  hangingPiecesDelta: { newlyHanging: [], nowDefended: [] },
  threatsDelta: { newThreats: [], resolvedThreats: [], carriedOverThreats: [] },
  isEmptyDelta: true,
};

const parseCall: ParserCall = async ({ system, user }) => {
  const isEval = system.startsWith("You parse chess analysis prose");
  const passage = user.split("Passage:")[1] ?? "";
  const isBad = passage.includes("Black is winning") || passage.includes("bishop pair");

  if (isEval) {
    if (!isBad) return { raw: "[]", costUsd: 0.0009 };
    return {
      raw: JSON.stringify([
        { stated_band: "winning", stated_cp: null, supporting_spans: ["Black is winning"], confidence: 0.95, claim_class: "evaluative", perspective: "black" },
      ]),
      costUsd: 0.0009,
    };
  }
  if (!isBad) return { raw: "[]", costUsd: 0.0013 };
  return {
    raw: JSON.stringify([
      { claim_text: "you lost the bishop pair", claim_type: "lost_bishop_pair", expected_in_delta: { side: "white" }, claim_class: "factual_delta_claim", confidence: 0.95 },
    ]),
    costUsd: 0.0013,
  };
};

let callIdx = 0;
const callLLM = async (_opts: CallLLMOptions): Promise<LLMResult> => {
  const content = callIdx === 0 ? HALLUCINATED : CORRECTED;
  callIdx++;
  return { content, provider: "anthropic", model: "claude-sonnet-4-test", inputTokens: 1200, outputTokens: 80, elapsedMs: 0 };
};

async function main() {
  console.log("=== Seeded Regenerate Demo ===\n");
  console.log("Stockfish eval:        +0.7 cp (slightly_better for White)");
  console.log("Hallucinated response: " + HALLUCINATED);
  console.log("\nRunning pipeline...\n");

  const r = await runValidationPipeline({
    initialRequest: { tier: "flagship", system: "coach system", messages: [{ role: "user", content: "analyze move 12" }] },
    stockfishEval: { cp: 70 },
    featureDelta,
    pieceRoleDiff: [],
    playerPerspective: "white",
    correlationId: "demo-" + Date.now(),
    parseCall,
    callLLM,
  });

  console.log("FINAL OUTCOME: " + r.finalOutcome);
  console.log("RETRY COUNT:   " + r.retryCount);
  console.log("TOTAL COST:    $" + r.totalCostUsd.toFixed(5));
  console.log("\nCUMULATIVE ISSUES:");
  for (const issue of r.cumulativeIssues) {
    console.log(`  - [${issue.check_name}] ${issue.detail}`);
  }
  console.log("\nTELEMETRY TRACE:");
  for (const e of r.telemetry) {
    console.log(`  ${e.check_name.padEnd(35)} ${e.fire_reason.padEnd(35)} retry=${e.retry_count}`);
  }
  console.log("\nFINAL RESPONSE:\n" + r.finalResponse);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

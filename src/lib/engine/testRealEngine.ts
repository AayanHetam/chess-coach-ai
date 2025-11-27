import { analyzeGameSurprises } from "./surpriseAnalyzer";
import { getSurpriseEngineService } from "./surpriseEngineService";

/**
 * Test real engine integration
 */
export async function testRealEngineIntegration() {
  console.log("🧪 Testing Real Engine Integration...");

  try {
    // Test engine service initialization
    const engineService = getSurpriseEngineService();
    await engineService.initialize();

    const status = engineService.getStatus();
    console.log("✅ Engine Status:", status);

    if (!status.isReady) {
      throw new Error("Engine not ready after initialization");
    }

    // Test with a simple game that should show clear evaluation differences
    const testGame = [
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bc4",
      "Bc5",
      "O-O",
      "Nf6",
      "d3",
      "O-O",
      "Nc3",
      "c5",
    ];
    const userColor: "white" | "black" = "black";

    console.log("🔄 Analyzing game with real engine...");
    const analysis = await analyzeGameSurprises(testGame, userColor);

    console.log("✅ Real Engine Analysis Results:");
    console.log(`Overall Assessment: ${analysis.overallAssessment}`);
    console.log(`Key Insights: ${analysis.keyInsights.length}`);

    // Show detailed analysis for moves with significant surprises
    analysis.moves.forEach((move) => {
      if (move.surpriseScore > 0.3) {
        console.log(`\n📊 Move ${move.moveNumber}. ${move.move}:`);
        console.log(`  Surprise Score: ${move.surpriseScore.toFixed(2)}`);
        console.log(`  Low Depth Eval: ${move.lowDepthEval}`);
        console.log(`  High Depth Eval: ${move.highDepthEval}`);
        console.log(`  Best Move: ${move.bestMove}`);
        console.log(`  Purpose: ${move.movePurpose}`);
        console.log(`  Severity: ${move.severity}`);
        console.log(`  Explanation: ${move.explanation}`);
      }
    });

    // Test specific problematic move (c5)
    const c5Move = analysis.moves.find((m) => m.move === "c5");
    if (c5Move) {
      console.log("\n🎯 Specific Test - Move c5:");
      console.log(`Surprise Score: ${c5Move.surpriseScore.toFixed(2)}`);
      console.log(`Purpose: ${c5Move.movePurpose}`);
      console.log(`Explanation: ${c5Move.explanation}`);
      console.log(`Severity: ${c5Move.severity}`);
    }

    return true;
  } catch (error) {
    console.error("❌ Real Engine Integration Test Failed:", error);
    return false;
  }
}

/**
 * Test engine evaluation directly
 */
export async function testEngineEvaluation() {
  console.log("🧪 Testing Direct Engine Evaluation...");

  try {
    const engineService = getSurpriseEngineService();
    await engineService.initialize();

    // Test with a simple position
    const { Chess } = await import("chess.js");
    const position = new Chess(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );

    console.log("🔄 Testing evaluation at different depths...");

    const eval8 = await engineService.getEngineEvaluation(position, 8);
    const eval16 = await engineService.getEngineEvaluation(position, 16);
    const eval20 = await engineService.getEngineEvaluation(position, 20);

    console.log("✅ Evaluation Results:");
    console.log(`Depth 8: ${eval8}`);
    console.log(`Depth 16: ${eval16}`);
    console.log(`Depth 20: ${eval20}`);

    const bestMove = await engineService.getBestMove(position, 16);
    console.log(`Best Move: ${bestMove}`);

    return true;
  } catch (error) {
    console.error("❌ Direct Engine Evaluation Test Failed:", error);
    return false;
  }
}

/**
 * Test multi-depth evaluation
 */
export async function testMultiDepthEvaluation() {
  console.log("🧪 Testing Multi-Depth Evaluation...");

  try {
    const engineService = getSurpriseEngineService();
    await engineService.initialize();

    const { Chess } = await import("chess.js");
    const position = new Chess(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
    );

    console.log("🔄 Testing multi-depth evaluation...");

    const result = await engineService.getMultiDepthEvaluation(position);

    console.log("✅ Multi-Depth Results:");
    console.log(`Low Depth Eval: ${result.lowDepthEval}`);
    console.log(`High Depth Eval: ${result.highDepthEval}`);
    console.log(`Best Move: ${result.bestMove}`);

    const surpriseScore =
      Math.abs(result.highDepthEval - result.lowDepthEval) / 100;
    console.log(`Surprise Score: ${surpriseScore.toFixed(2)}`);

    return true;
  } catch (error) {
    console.error("❌ Multi-Depth Evaluation Test Failed:", error);
    return false;
  }
}

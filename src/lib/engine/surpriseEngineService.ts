import { Chess } from "chess.js";
import { UciEngine } from "./uciEngine";
import { Stockfish16_1 } from "./stockfish16_1";
import { EngineName } from "@/types/enums";
import { PositionEval } from "@/types/eval";

/**
 * Engine service for surprise analysis that uses the existing Stockfish infrastructure
 */
export class SurpriseEngineService {
  private engine: UciEngine | null = null;
  private isInitializing = false;

  /**
   * Initialize the engine for surprise analysis
   */
  async initialize(): Promise<void> {
    if (this.engine || this.isInitializing) return;

    this.isInitializing = true;
    try {
      // Use Stockfish 16.1 as it's a good balance of strength and speed
      if (Stockfish16_1.isSupported()) {
        this.engine = await Stockfish16_1.create(true); // Use lite version for speed
      } else {
        // Fallback to Stockfish 11 if 16.1 is not supported
        const { Stockfish11 } = await import("./stockfish11");
        this.engine = await Stockfish11.create();
      }
      console.log(
        "✅ Surprise Engine Service initialized with:",
        this.engine.name
      );
    } catch (error) {
      console.error("❌ Failed to initialize Surprise Engine Service:", error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Get engine evaluation at specific depth
   */
  async getEngineEvaluation(position: Chess, depth: number): Promise<number> {
    await this.ensureEngineReady();

    try {
      const fen = position.fen();
      const evaluation = await this.engine!.evaluatePositionWithUpdate({
        fen,
        depth,
        multiPv: 1,
      });

      // Extract centipawn evaluation from the first line
      const firstLine = evaluation.lines[0];
      if (!firstLine) return 0;

      if (firstLine.mate !== undefined) {
        // Convert mate score to centipawns (approximate)
        return firstLine.mate > 0 ? 10000 : -10000;
      }

      return firstLine.cp || 0;
    } catch (error) {
      console.error("Engine evaluation failed:", error);
      return 0;
    }
  }

  /**
   * Get best move from engine
   */
  async getBestMove(position: Chess, depth: number): Promise<string> {
    await this.ensureEngineReady();

    try {
      const fen = position.fen();
      const evaluation = await this.engine!.evaluatePositionWithUpdate({
        fen,
        depth,
        multiPv: 1,
      });

      return evaluation.bestMove || "";
    } catch (error) {
      console.error("Failed to get best move:", error);
      return "";
    }
  }

  /**
   * Get multi-depth evaluation for surprise analysis
   */
  async getMultiDepthEvaluation(position: Chess): Promise<{
    lowDepthEval: number;
    highDepthEval: number;
    bestMove: string;
  }> {
    await this.ensureEngineReady();

    try {
      const fen = position.fen();

      // Get low depth evaluation (human-like thinking)
      const lowDepthEval = await this.getEngineEvaluation(position, 8);

      // Get high depth evaluation (engine-like thinking)
      const highDepthEval = await this.getEngineEvaluation(position, 20);

      // Get best move from high depth analysis
      const bestMove = await this.getBestMove(position, 20);

      return {
        lowDepthEval,
        highDepthEval,
        bestMove,
      };
    } catch (error) {
      console.error("Multi-depth evaluation failed:", error);
      return {
        lowDepthEval: 0,
        highDepthEval: 0,
        bestMove: "",
      };
    }
  }

  /**
   * Ensure engine is ready for use
   */
  private async ensureEngineReady(): Promise<void> {
    if (!this.engine) {
      await this.initialize();
    }

    if (!this.engine?.getIsReady()) {
      throw new Error("Engine not ready for evaluation");
    }
  }

  /**
   * Shutdown the engine
   */
  shutdown(): void {
    if (this.engine) {
      this.engine.shutdown();
      this.engine = null;
    }
  }

  /**
   * Get engine status
   */
  getStatus(): { isReady: boolean; engineName?: string } {
    return {
      isReady: this.engine?.getIsReady() || false,
      engineName: this.engine?.name,
    };
  }
}

// Singleton instance
let surpriseEngineService: SurpriseEngineService | null = null;

/**
 * Get the singleton instance of SurpriseEngineService
 */
export function getSurpriseEngineService(): SurpriseEngineService {
  if (!surpriseEngineService) {
    surpriseEngineService = new SurpriseEngineService();
  }
  return surpriseEngineService;
}

/**
 * Initialize the surprise engine service
 */
export async function initializeSurpriseEngine(): Promise<void> {
  const service = getSurpriseEngineService();
  await service.initialize();
}

/**
 * Shutdown the surprise engine service
 */
export function shutdownSurpriseEngine(): void {
  if (surpriseEngineService) {
    surpriseEngineService.shutdown();
    surpriseEngineService = null;
  }
}

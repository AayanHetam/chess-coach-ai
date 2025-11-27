import { MaiaEngine, MaiaPrediction } from "./maiaEngine";
import {
  getMaiaWeightPath,
  downloadMaiaWeights,
  checkMaiaWeightExists,
} from "./maiaDownloader";
import { join } from "path";

export interface MaiaServiceConfig {
  lc0Path?: string;
  weightsPath?: string;
  defaultRating?: number;
  enableCaching?: boolean;
  autoDownload?: boolean; // Automatically download weights if missing
}

/**
 * Service layer for Maia engine predictions
 * Handles caching, rating management, and provides simplified API
 */
export class MaiaService {
  private engine: MaiaEngine | null = null;
  private config: MaiaServiceConfig;
  private cache: Map<string, MaiaPrediction> = new Map();
  private currentRating: number;

  constructor(config: MaiaServiceConfig = {}) {
    this.config = {
      enableCaching: true,
      defaultRating: 1500,
      autoDownload: true, // Enable auto-download by default
      ...config,
    };
    this.currentRating = this.config.defaultRating || 1500;
  }

  /**
   * Initialize Maia engine
   */
  public async initialize(rating?: number): Promise<void> {
    if (rating !== undefined) {
      this.currentRating = rating;
    }

    // Auto-download weights if enabled and missing
    if (this.config.autoDownload) {
      const weightsDir =
        this.config.weightsPath || join(process.cwd(), "maia-weights");
      try {
        const weightPath = await getMaiaWeightPath(
          this.currentRating,
          weightsDir
        );
        if (!weightPath) {
          console.warn(
            `Maia weight for rating ${this.currentRating} not available. Maia predictions will be disabled.`
          );
          return;
        }
        // Update weightsPath if not set
        if (!this.config.weightsPath) {
          this.config.weightsPath = weightsDir;
        }
      } catch (error) {
        console.error("Failed to download Maia weights:", error);
        // Continue without Maia - will fail gracefully
      }
    }

    if (!this.engine) {
      this.engine = new MaiaEngine({
        lc0Path: this.config.lc0Path || "lc0",
        weightsPath: this.config.weightsPath || "./maia-weights",
        defaultRating: this.currentRating,
      });
    }

    try {
      await this.engine.initialize(this.currentRating);
    } catch (error) {
      console.error("Maia engine initialization failed:", error);
      // If Lc0 is not available, we'll handle this gracefully
      throw error;
    }
  }

  /**
   * Predict human-like move for a position
   * Uses caching if enabled
   */
  public async predictHumanMove(
    fen: string,
    rating?: number
  ): Promise<MaiaPrediction> {
    // Update rating if provided
    if (rating !== undefined && rating !== this.currentRating) {
      this.currentRating = rating;
      // Reinitialize engine with new rating
      if (this.engine) {
        await this.engine.close();
        this.engine = null;
      }
    }

    // Initialize if needed
    if (!this.engine) {
      await this.initialize(rating);
    }

    // Check cache
    const cacheKey = `${fen}_${this.currentRating}`;
    if (this.config.enableCaching && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Get prediction from engine
    const prediction = await this.engine!.predictMove(fen, this.currentRating);

    // Cache result
    if (this.config.enableCaching) {
      this.cache.set(cacheKey, prediction);
    }

    return prediction;
  }

  /**
   * Get multiple move predictions with probabilities
   */
  public async getMoveProbabilities(
    fen: string,
    rating?: number
  ): Promise<Array<{ move: string; probability: number }>> {
    if (!this.engine) {
      await this.initialize(rating);
    }

    return this.engine!.getMoveProbabilities(fen, rating);
  }

  /**
   * Batch predict moves for multiple positions
   */
  public async batchPredict(
    positions: Array<{ fen: string; rating?: number }>
  ): Promise<MaiaPrediction[]> {
    const predictions: MaiaPrediction[] = [];

    for (const pos of positions) {
      const prediction = await this.predictHumanMove(pos.fen, pos.rating);
      predictions.push(prediction);
    }

    return predictions;
  }

  /**
   * Clear prediction cache
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get current rating being used
   */
  public getCurrentRating(): number {
    return this.currentRating;
  }

  /**
   * Set rating and reinitialize if needed
   */
  public async setRating(rating: number): Promise<void> {
    if (rating !== this.currentRating) {
      this.currentRating = rating;
      if (this.engine) {
        await this.engine.close();
        this.engine = null;
      }
      await this.initialize(rating);
    }
  }

  /**
   * Cleanup
   */
  public async close(): Promise<void> {
    if (this.engine) {
      await this.engine.close();
      this.engine = null;
    }
    this.cache.clear();
  }
}

// Singleton instance for use across the application
let maiaServiceInstance: MaiaService | null = null;

export function getMaiaService(config?: MaiaServiceConfig): MaiaService {
  if (!maiaServiceInstance) {
    maiaServiceInstance = new MaiaService(config);
  }
  return maiaServiceInstance;
}


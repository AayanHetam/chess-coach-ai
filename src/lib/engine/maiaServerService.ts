import { Chess } from "chess.js";
import { moveLineUciToSan } from "../chess";
import { getMaiaWeightPath } from "./maiaDownloader";
import { spawn, ChildProcess } from "child_process";
import { join } from "path";

export interface MaiaServerPrediction {
  humanLikeMove: string;
  confidence: number;
  alternativeMoves?: Array<{ move: string; probability: number }>;
  rating: number;
}

/**
 * Server-side Maia service that runs Lc0 with Maia weights
 * This automatically downloads weights if needed and runs Maia on the server
 */
/**
 * Fallback MAIA service that uses heuristics when Lc0 is not available
 */
class FallbackMaiaService {
  async predictMove(
    fen: string,
    rating: number
  ): Promise<MaiaServerPrediction> {
    const game = new Chess(fen);
    const legalMoves = game.moves({ verbose: true });

    if (legalMoves.length === 0) {
      throw new Error("No legal moves available");
    }

    // Score moves based on simple heuristics that vary by rating
    const scoredMoves = legalMoves.map((move) => {
      let score = 0.5; // Base score

      const testGame = new Chess(fen);
      testGame.move(move);

      if (rating < 1500) {
        if (move.captured) {
          const pieceValues: Record<string, number> = {
            p: 1, n: 3, b: 3, r: 5, q: 9, k: 0,
          };
          score += 0.3 * (pieceValues[move.captured] || 1) / 9;
        }
        if (move.piece === "p") {
          const centerSquares = ["d4", "d5", "e4", "e5"];
          if (centerSquares.includes(move.to)) {
            score += 0.2;
          }
        }
        if (move.piece === "n" || move.piece === "b") {
          score += 0.15;
        }
      } else if (rating < 1900) {
        if (move.captured) score += 0.25;
        if (move.san.includes("+")) score += 0.2;
        if (move.promotion) score += 0.3;
      } else {
        if (move.captured) score += 0.2;
        if (move.san.includes("+")) score += 0.25;
        if (move.san.includes("x")) score += 0.15;
      }

      if (testGame.isCheck()) {
        score -= 0.1;
      }

      return { move, score: Math.max(0.1, Math.min(0.95, score)) };
    });

    scoredMoves.sort((a, b) => b.score - a.score);
    const totalScore = scoredMoves.reduce((sum, m) => sum + m.score, 0);
    const probabilities = scoredMoves.map((m) => ({
      move: m.move.san,
      probability: m.score / totalScore,
    }));

    const bestMove = probabilities[0];
    const confidence = Math.max(0.3, Math.min(0.9, bestMove.probability * 1.5));

    return {
      humanLikeMove: bestMove.move,
      confidence,
      alternativeMoves: probabilities.slice(1, 5).map((p) => ({
        move: p.move,
        probability: p.probability,
      })),
      rating,
    };
  }
}

export class MaiaServerService {
  private static instance: MaiaServerService | null = null;
  private processes: Map<number, ChildProcess> = new Map();
  private isInitialized: boolean = false;
  private weightsDir: string;
  private useFallback: boolean = false;
  private fallbackService: FallbackMaiaService;

  private constructor(weightsDir: string = "./maia-weights") {
    this.weightsDir = weightsDir;
    this.fallbackService = new FallbackMaiaService();
  }

  public static getInstance(
    weightsDir?: string
  ): MaiaServerService {
    if (!MaiaServerService.instance) {
      MaiaServerService.instance = new MaiaServerService(weightsDir);
    }
    return MaiaServerService.instance;
  }

  /**
   * Initialize Maia for a specific rating
   * Automatically downloads weights if needed
   * Falls back to heuristic service if Lc0 is not available
   */
  public async initialize(rating: number): Promise<void> {
    // If already using fallback, no need to reinitialize
    if (this.useFallback) {
      return;
    }

    if (this.processes.has(rating)) {
      return; // Already initialized for this rating
    }

    // Try to use real Lc0-based MAIA first
    try {
      // Get or download weight file (optional - we can work without it)
      const weightPath = await getMaiaWeightPath(rating, this.weightsDir);

      // Try to find Lc0 - check common locations
      const lc0Path = await this.findLc0Path();
      
      if (!lc0Path || !weightPath) {
        // Lc0 not available, use fallback
        console.log("⚠️ Lc0 not available, using fallback MAIA service (heuristic-based)");
        this.useFallback = true;
        this.isInitialized = true;
        return;
      }

      // Spawn Lc0 process with Maia weights
      const process = spawn(lc0Path, [
        `--weights=${weightPath}`,
        "--backend=multiplexing",
      ]);

      let ready = false;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!ready) {
            process.kill();
            // Fallback to heuristic service
            console.log("⚠️ Lc0 initialization timeout, using fallback MAIA service");
            this.useFallback = true;
            this.isInitialized = true;
            resolve();
          }
        }, 10000);

        process.stdout?.on("data", (data: Buffer) => {
          const output = data.toString();
          if (output.includes("readyok") || output.includes("uciok")) {
            if (!ready) {
              ready = true;
              clearTimeout(timeout);
              this.processes.set(rating, process);
              this.isInitialized = true;
              console.log("✅ Maia engine initialized with Lc0");
              resolve();
            }
          }
        });

        process.stderr?.on("data", (data: Buffer) => {
          console.error(`Maia stderr (rating ${rating}):`, data.toString());
        });

        process.on("error", (error) => {
          clearTimeout(timeout);
          // Fallback to heuristic service
          console.log("⚠️ Lc0 not available, using fallback MAIA service:", error.message);
          this.useFallback = true;
          this.isInitialized = true;
          resolve();
        });

        // Send UCI initialization
        process.stdin?.write("uci\n");
        process.stdin?.write("isready\n");
      });
    } catch (error) {
      // Any error means we use fallback
      console.log("⚠️ Using fallback MAIA service (Lc0 unavailable):", error instanceof Error ? error.message : "Unknown error");
      this.useFallback = true;
      this.isInitialized = true;
    }
  }

  /**
   * Find Lc0 executable path
   */
  private async findLc0Path(): Promise<string | null> {
    // Check environment variable first
    if (process.env.LC0_PATH) {
      return process.env.LC0_PATH;
    }

    // Check common locations
    const commonPaths = [
      "lc0",
      "/usr/local/bin/lc0",
      "/usr/bin/lc0",
      join(process.cwd(), "lc0"),
      join(process.cwd(), "bin", "lc0"),
    ];

    // Try to find lc0 in PATH
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    for (const path of commonPaths) {
      try {
        await execAsync(`which ${path}`);
        return path;
      } catch {
        // Try next path
      }
    }

    return null;
  }

  /**
   * Predict human-like move for a position
   * Uses Lc0 if available, otherwise uses heuristic fallback
   */
  public async predictMove(
    fen: string,
    rating: number
  ): Promise<MaiaServerPrediction> {
    // Use fallback if Lc0 is not available
    if (this.useFallback) {
      return this.fallbackService.predictMove(fen, rating);
    }

    // Initialize if needed
    if (!this.processes.has(rating)) {
      await this.initialize(rating);
      
      // If initialization resulted in fallback, use it
      if (this.useFallback) {
        return this.fallbackService.predictMove(fen, rating);
      }
    }

    const process = this.processes.get(rating);
    if (!process) {
      // Fallback if process not available
      return this.fallbackService.predictMove(fen, rating);
    }

    return new Promise((resolve, reject) => {
      let bestMove: string | null = null;
      let moveProbabilities: Array<{ move: string; probability: number }> = [];
      let analysisComplete = false;

      const timeout = setTimeout(() => {
        if (!analysisComplete) {
          analysisComplete = true;
          // Fallback on timeout
          this.fallbackService.predictMove(fen, rating).then(resolve).catch(reject);
        }
      }, 5000);

      const dataHandler = (data: Buffer) => {
        if (analysisComplete) return;

        const output = data.toString();
        const lines = output.split("\n");

        for (const line of lines) {
          if (line.startsWith("bestmove")) {
            const match = line.match(/bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
            if (match) {
              bestMove = match[1];
            }
          }

          if (line.includes("info") && line.includes("string")) {
            const moveMatch = line.match(/move\s+(\S+)/);
            const probMatch = line.match(/probability\s+([\d.]+)/);
            if (moveMatch && probMatch) {
              moveProbabilities.push({
                move: moveMatch[1],
                probability: parseFloat(probMatch[1]),
              });
            }
          }
        }

        if (bestMove && !analysisComplete) {
          clearTimeout(timeout);
          analysisComplete = true;

          // Convert UCI to SAN
          let humanLikeMove = bestMove;
          try {
            const uciToSan = moveLineUciToSan(fen);
            humanLikeMove = uciToSan(bestMove);
          } catch (error) {
            console.warn("Could not convert UCI to SAN:", error);
          }

          // Sort probabilities
          moveProbabilities.sort((a, b) => b.probability - a.probability);

          let confidence = 0.5;
          if (moveProbabilities.length > 0) {
            const bestMoveProb = moveProbabilities.find(
              (m) => m.move === bestMove
            );
            confidence = bestMoveProb
              ? bestMoveProb.probability
              : moveProbabilities[0].probability;
          }

          resolve({
            humanLikeMove,
            confidence: Math.max(0.1, Math.min(1.0, confidence)),
            alternativeMoves:
              moveProbabilities.length > 1
                ? moveProbabilities
                    .filter((m) => m.move !== bestMove)
                    .slice(0, 4)
                    .map((m) => {
                      try {
                        const uciToSan = moveLineUciToSan(fen);
                        return {
                          move: uciToSan(m.move),
                          probability: m.probability,
                        };
                      } catch {
                        return { move: m.move, probability: m.probability };
                      }
                    })
                : undefined,
            rating,
          });
        }
      };

      const listener = (data: Buffer) => {
        dataHandler(data);
        if (bestMove && process) {
          process.stdout?.removeListener("data", listener);
        }
      };

      process.stdout?.on("data", listener);

      // Send position and go command
      process.stdin?.write(`position fen ${fen}\n`);
      process.stdin?.write("setoption name VerboseMoveStats value true\n");
      process.stdin?.write("go nodes 1\n");
    });
  }

  /**
   * Cleanup all processes
   */
  public async cleanup(): Promise<void> {
    for (const [rating, process] of Array.from(this.processes.entries())) {
      process.stdin?.write("quit\n");
      process.kill();
    }
    this.processes.clear();
    this.isInitialized = false;
    this.useFallback = false;
  }
}


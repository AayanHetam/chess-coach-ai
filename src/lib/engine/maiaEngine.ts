import { spawn, ChildProcess } from "child_process";
import { Chess } from "chess.js";
import { moveLineUciToSan } from "../chess";

export interface MaiaConfig {
  lc0Path?: string;
  weightsPath?: string;
  defaultRating?: number;
}

export interface MaiaPrediction {
  humanLikeMove: string;
  confidence: number;
  alternativeMoves?: Array<{ move: string; probability: number }>;
  rating: number;
}

export class MaiaEngine {
  private lc0Path: string;
  private weightsPath: string;
  private defaultRating: number;
  private process: ChildProcess | null = null;
  private isReady: boolean = false;
  private currentRating: number;

  constructor(config: MaiaConfig = {}) {
    this.lc0Path = config.lc0Path || "lc0";
    this.weightsPath = config.weightsPath || "./maia-weights";
    this.defaultRating = config.defaultRating || 1500;
    this.currentRating = this.defaultRating;
  }

  /**
   * Get the appropriate Maia weight file based on rating
   * Maia models: 1100, 1500, 1900, 2100
   */
  private getWeightFileForRating(rating: number): string {
    if (rating <= 1300) {
      return "maia-1100.pb";
    } else if (rating <= 1700) {
      return "maia-1500.pb";
    } else if (rating <= 2000) {
      return "maia-1900.pb";
    } else {
      return "maia-2100.pb";
    }
  }

  /**
   * Initialize Maia engine with appropriate weight file
   */
  public async initialize(rating?: number): Promise<void> {
    if (rating !== undefined) {
      this.currentRating = rating;
    }

    const weightFile = this.getWeightFileForRating(this.currentRating);
    const weightPath = `${this.weightsPath}/${weightFile}`;

    return new Promise((resolve, reject) => {
      try {
        // Spawn Lc0 process with Maia weights
        this.process = spawn(this.lc0Path, [
          `--weights=${weightPath}`,
          "--backend=multiplexing",
        ]);

        let readyReceived = false;

        this.process.stdout?.on("data", (data: Buffer) => {
          const output = data.toString();
          if (output.includes("readyok") || output.includes("uciok")) {
            if (!readyReceived) {
              readyReceived = true;
              this.isReady = true;
              resolve();
            }
          }
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          console.error(`Maia engine stderr: ${data.toString()}`);
        });

        this.process.on("error", (error) => {
          console.error(`Failed to start Maia engine: ${error.message}`);
          reject(
            new Error(
              `Maia engine failed to start. Make sure Lc0 is installed and Maia weights are available at ${weightPath}`
            )
          );
        });

        // Send UCI initialization commands
        this.process.stdin?.write("uci\n");
        this.process.stdin?.write("isready\n");

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!readyReceived) {
            reject(new Error("Maia engine initialization timeout"));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Predict human-like move for a given position
   */
  public async predictMove(fen: string, rating?: number): Promise<MaiaPrediction> {
    if (rating !== undefined && rating !== this.currentRating) {
      // Reinitialize with new rating if different
      await this.initialize(rating);
    }

    if (!this.isReady || !this.process) {
      await this.initialize(rating);
    }

    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error("Maia engine not initialized"));
        return;
      }

      let bestMove: string | null = null;
      let moveProbabilities: Array<{ move: string; probability: number }> = [];
      let analysisComplete = false;
      let listener: ((data: Buffer) => void) | null = null;

      const timeout = setTimeout(() => {
        if (!analysisComplete) {
          analysisComplete = true;
          if (listener && this.process) {
            this.process.stdout?.removeListener("data", listener);
          }
          reject(new Error("Maia prediction timeout"));
        }
      }, 5000);

      const dataHandler = (data: Buffer) => {
        const output = data.toString();
        const lines = output.split("\n");

        for (const line of lines) {
          // Parse bestmove
          if (line.startsWith("bestmove")) {
            const match = line.match(/bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
            if (match) {
              bestMove = match[1];
            }
          }

          // Parse move probabilities from info lines
          // Lc0/Maia outputs move probabilities in info lines with "string" keyword
          if (line.includes("info") && line.includes("string")) {
            // Try to extract move probabilities
            // Format: info string move e2e4 probability 0.15
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

        // If we have a bestmove, we're done
        if (bestMove && !analysisComplete) {
          clearTimeout(timeout);
          analysisComplete = true;

          // Convert UCI move to SAN
          let humanLikeMove = bestMove;
          try {
            const chess = new Chess(fen);
            const uciToSan = moveLineUciToSan(fen);
            humanLikeMove = uciToSan(bestMove);
          } catch (error) {
            console.warn("Could not convert UCI to SAN, using UCI:", error);
          }

          // Sort move probabilities by probability (highest first)
          moveProbabilities.sort((a, b) => b.probability - a.probability);

          // Calculate confidence from top move probability
          // If bestMove matches top probability move, use that probability
          // Otherwise, use a default confidence
          let confidence = 0.5;
          if (moveProbabilities.length > 0) {
            const topMove = moveProbabilities[0];
            if (topMove.move === bestMove) {
              confidence = topMove.probability;
            } else {
              // Find bestMove in probabilities
              const bestMoveProb = moveProbabilities.find(
                (m) => m.move === bestMove
              );
              confidence = bestMoveProb
                ? bestMoveProb.probability
                : topMove.probability;
            }
          }

          resolve({
            humanLikeMove,
            confidence: Math.max(0.1, Math.min(1.0, confidence)), // Clamp between 0.1 and 1.0
            alternativeMoves:
              moveProbabilities.length > 1
                ? moveProbabilities
                    .filter((m) => m.move !== bestMove)
                    .slice(0, 4)
                    .map((m) => {
                      // Convert to SAN
                      try {
                        const chess = new Chess(fen);
                        const uciToSan = moveLineUciToSan(fen);
                        return {
                          move: uciToSan(m.move),
                          probability: m.probability,
                        };
                      } catch {
                        return {
                          move: m.move,
                          probability: m.probability,
                        };
                      }
                    })
                : undefined,
            rating: this.currentRating,
          });
        }
      };

      // Listen for data until we get bestmove
      listener = (data: Buffer) => {
        dataHandler(data);
        // Remove listener once we have bestmove
        if (bestMove && this.process && listener) {
          this.process.stdout?.removeListener("data", listener);
        }
      };
      this.process.stdout?.on("data", listener);

      // Send position and go command
      // Use go nodes 1 for speed, but also request move probabilities
      this.process.stdin?.write(`position fen ${fen}\n`);
      this.process.stdin?.write("setoption name VerboseMoveStats value true\n");
      this.process.stdin?.write("go nodes 1\n"); // Use minimal nodes for speed
    });
  }

  /**
   * Get multiple move predictions with probabilities
   */
  public async getMoveProbabilities(
    fen: string,
    rating?: number
  ): Promise<Array<{ move: string; probability: number }>> {
    const prediction = await this.predictMove(fen, rating);
    const moves = [
      { move: prediction.humanLikeMove, probability: prediction.confidence },
      ...(prediction.alternativeMoves || []),
    ];
    return moves;
  }

  /**
   * Cleanup and close engine
   */
  public async close(): Promise<void> {
    if (this.process) {
      this.process.stdin?.write("quit\n");
      this.process.kill();
      this.process = null;
      this.isReady = false;
    }
  }
}


import { spawn, ChildProcessWithoutNullStreams } from "child_process";

export type EngineScore =
  | { kind: "cp"; cp: number }
  | { kind: "mate"; mate: number };

export interface PlyEval {
  ply: number;            // 1-indexed; ply 0 = startpos before any move
  fenAfter: string;
  sanMove: string | null; // null at ply 0
  score: EngineScore;     // from White's POV
  depth: number;
}

const STOCKFISH_BIN = process.env.STOCKFISH_BIN || "/opt/homebrew/bin/stockfish";

/** Long-lived Stockfish process. Call init() then evaluate() N times then close(). */
export class StockfishEngine {
  private proc: ChildProcessWithoutNullStreams;
  private buf = "";
  private onLine: ((line: string) => void) | null = null;

  constructor() {
    this.proc = spawn(STOCKFISH_BIN, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buf += chunk.toString("utf8");
      let nl: number;
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (this.onLine) this.onLine(line);
      }
    });
    this.proc.on("error", (e) => console.error("[stockfish] proc error:", e));
  }

  private send(cmd: string): void {
    this.proc.stdin.write(cmd + "\n");
  }

  /** Drain stdout until a single line matches `done`, calling `onInfo` for any prior info lines. */
  private async drainUntil(
    done: (line: string) => boolean,
    onInfo: (line: string) => void
  ): Promise<string> {
    return new Promise<string>((resolve) => {
      this.onLine = (line) => {
        if (done(line)) {
          this.onLine = null;
          resolve(line);
        } else {
          onInfo(line);
        }
      };
    });
  }

  async init(): Promise<void> {
    this.send("uci");
    await this.drainUntil((l) => l === "uciok", () => {});
    this.send("setoption name Threads value 1");
    this.send("setoption name Hash value 64");
    this.send("isready");
    await this.drainUntil((l) => l === "readyok", () => {});
  }

  /**
   * Evaluate FEN at `depth`. Returns score in White's POV.
   * Stockfish's `score` is side-to-move POV; we sign-flip when Black is to move.
   */
  async evaluate(fen: string, depth = 14): Promise<{ score: EngineScore; depth: number }> {
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);

    let last: { score: EngineScore; depth: number } | null = null;
    await this.drainUntil(
      (l) => l.startsWith("bestmove "),
      (l) => {
        if (l.startsWith("info ") && l.includes(" score ")) {
          const parsed = parseInfoLine(l, fen);
          if (parsed) last = parsed;
        }
      }
    );

    if (!last) throw new Error(`Stockfish returned no score for FEN: ${fen}`);
    return last;
  }

  close(): void {
    try {
      this.send("quit");
    } catch {
      /* ignore */
    }
    this.proc.kill();
  }
}

function parseInfoLine(line: string, fen: string): { score: EngineScore; depth: number } | null {
  const depthMatch = line.match(/\bdepth (\d+)\b/);
  const cpMatch = line.match(/\bscore cp (-?\d+)\b/);
  const mateMatch = line.match(/\bscore mate (-?\d+)\b/);
  if (!depthMatch) return null;
  const depth = parseInt(depthMatch[1], 10);
  const stm = fen.split(" ")[1] === "b" ? -1 : 1;

  if (cpMatch) {
    const cpStm = parseInt(cpMatch[1], 10);
    return { score: { kind: "cp", cp: cpStm * stm }, depth };
  }
  if (mateMatch) {
    const mateStm = parseInt(mateMatch[1], 10);
    return { score: { kind: "mate", mate: mateStm * stm }, depth };
  }
  return null;
}

/** Mate-aware normalization to centipawn-equivalent (White POV). See plan §6. */
export function normalizeEval(score: EngineScore): number {
  if (score.kind === "cp") return Math.max(-2000, Math.min(2000, score.cp));
  const sign = score.mate > 0 ? 1 : -1;
  return sign * (10000 - Math.abs(score.mate) * 100);
}

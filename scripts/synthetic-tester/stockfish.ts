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

/** One multi-PV line from `evaluateMultiPv`. `rank` is 1-based (1 = best). */
export interface MultiPvLine {
  rank: number;
  score: EngineScore;     // White's POV (sign-flipped like evaluate())
  pvUci: string[];        // principal variation in UCI long-algebraic
  bestMoveUci: string;    // = pvUci[0] (the move this line starts with)
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
    // Enable multi-PV so evaluateMultiPv() returns the top lines. evaluate()
    // still works (it keeps the last scored info line regardless of multipv).
    this.send("setoption name MultiPV value 3");
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

  /**
   * Evaluate FEN at `depth` returning the top `multiPv` lines, ranked best-first.
   * Requires `setoption name MultiPV` to have been set (init() sets it to 3).
   * Scores are sign-flipped to White's POV exactly like evaluate().
   *
   * Keeps the LAST `info` line seen per `multipv` rank before `bestmove`, which
   * is the deepest/most-final estimate for that line at the requested depth.
   */
  async evaluateMultiPv(fen: string, depth = 16, multiPv = 3): Promise<MultiPvLine[]> {
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth}`);

    const byRank = new Map<number, MultiPvLine>();
    await this.drainUntil(
      (l) => l.startsWith("bestmove "),
      (l) => {
        if (l.startsWith("info ") && l.includes(" multipv ") && l.includes(" score ")) {
          const parsed = parseMultiPvInfoLine(l, fen);
          if (parsed) byRank.set(parsed.rank, parsed);
        }
      }
    );

    const lines = Array.from(byRank.values())
      .filter((l) => l.rank >= 1 && l.rank <= multiPv)
      .sort((a, b) => a.rank - b.rank);
    if (lines.length === 0) {
      throw new Error(`Stockfish returned no multipv lines for FEN: ${fen}`);
    }
    return lines;
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

/**
 * Parse a `info ... multipv N ... score cp|mate ... pv <uci...>` line into a
 * ranked PV line. Returns null if the line lacks a rank, score, or pv.
 * Sign-flips the score to White's POV using the same rule as parseInfoLine.
 * Exported for unit testing the parser without a Stockfish binary.
 */
export function parseMultiPvInfoLine(line: string, fen: string): MultiPvLine | null {
  const rankMatch = line.match(/\bmultipv (\d+)\b/);
  const depthMatch = line.match(/\bdepth (\d+)\b/);
  const cpMatch = line.match(/\bscore cp (-?\d+)\b/);
  const mateMatch = line.match(/\bscore mate (-?\d+)\b/);
  const pvMatch = line.match(/\bpv (.+)$/);
  if (!rankMatch || !depthMatch || !pvMatch) return null;

  const rank = parseInt(rankMatch[1], 10);
  const depth = parseInt(depthMatch[1], 10);
  const stm = fen.split(" ")[1] === "b" ? -1 : 1;

  let score: EngineScore;
  if (cpMatch) {
    score = { kind: "cp", cp: parseInt(cpMatch[1], 10) * stm };
  } else if (mateMatch) {
    score = { kind: "mate", mate: parseInt(mateMatch[1], 10) * stm };
  } else {
    return null;
  }

  const pvUci = pvMatch[1].trim().split(/\s+/).filter(Boolean);
  if (pvUci.length === 0) return null;
  return { rank, score, pvUci, bestMoveUci: pvUci[0], depth };
}

/** Mate-aware normalization to centipawn-equivalent (White POV). See plan §6. */
export function normalizeEval(score: EngineScore): number {
  if (score.kind === "cp") return Math.max(-2000, Math.min(2000, score.cp));
  const sign = score.mate > 0 ? 1 : -1;
  return sign * (10000 - Math.abs(score.mate) * 100);
}

/**
 * SLOW, OFF BY DEFAULT: regenerates fixtures/coach-accuracy/engine-truth.json
 * by running a native Stockfish over every position of the regression games.
 *
 *   COACH_TRUTH_REGEN=1 npx vitest run src/lib/coach/__tests__/engineTruth.regen.test.ts
 *
 * Needs a `stockfish` binary on PATH (or STOCKFISH_PATH). One thread, a fixed
 * hash and `ucinewgame` before every position, so a rerun with the same
 * binary reproduces the file. MultiPV 3, like the browser's review pass.
 * Takes several minutes. Every other test reads the stored file instead.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  ENGINE_TRUTH_FILE,
  GAME_FILES,
  loadGame,
  type EngineTruth,
  type GameId,
  type TruthLine,
  type TruthPosition,
} from "./coachAccuracyFixtures";

const REGEN = process.env.COACH_TRUTH_REGEN === "1";
const DEPTHS = [16, 20] as const;
const MULTI_PV = 3;
const THREADS = 1;
const HASH_MB = 64;
/** Stored PV length: enough for every line a card draws (8) plus room. */
const PV_PLIES = 12;

class Uci {
  private buf = "";
  private listeners: Array<(line: string) => void> = [];
  private proc = spawn(process.env.STOCKFISH_PATH ?? "stockfish");

  constructor() {
    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buf += chunk.toString();
      let nl: number;
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        for (const l of [...this.listeners]) l(line);
      }
    });
  }

  send(cmd: string) {
    this.proc.stdin.write(`${cmd}\n`);
  }

  until(
    done: (line: string) => boolean,
    each?: (line: string) => void
  ): Promise<string> {
    return new Promise((resolve) => {
      const l = (line: string) => {
        each?.(line);
        if (done(line)) {
          this.listeners.splice(this.listeners.indexOf(l), 1);
          resolve(line);
        }
      };
      this.listeners.push(l);
    });
  }

  quit() {
    this.send("quit");
  }
}

/** A UCI PV kept only as far as it replays legally from `fen`. */
function legalPrefix(fen: string, pv: string[]): string[] {
  const g = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, PV_PLIES)) {
    try {
      g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      break;
    }
    out.push(u);
  }
  return out;
}

async function analyse(uci: Uci, fen: string, depth: number) {
  uci.send("ucinewgame");
  uci.send("isready");
  await uci.until((l) => l === "readyok");
  uci.send(`position fen ${fen}`);
  uci.send(`go depth ${depth}`);
  const byPv = new Map<
    number,
    { depth: number; kind: string; value: number; pv: string[] }
  >();
  const best = await uci.until(
    (l) => l.startsWith("bestmove"),
    (l) => {
      const m = l.match(
        / depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+).*? pv (.+)$/
      );
      if (m)
        byPv.set(Number(m[2]), {
          depth: Number(m[1]),
          kind: m[3],
          value: Number(m[4]),
          pv: m[5].split(" "),
        });
    }
  );
  const sign = fen.split(" ")[1] === "w" ? 1 : -1;
  const lines: TruthLine[] = Array.from(byPv.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([multiPv, l]) => ({
      multiPv,
      // `|| 0` turns the -0 of a flipped 0.00 into 0 (JSON cannot carry -0).
      evalCp: l.kind === "cp" ? sign * l.value || 0 : null,
      mateIn: l.kind === "mate" ? sign * l.value || 0 : null,
      pv: legalPrefix(fen, l.pv),
    }));
  return { bestMove: best.split(" ")[1] ?? null, lines };
}

/** One position per line: readable diffs, and a file of tens of kB rather than hundreds. */
function serialize(truth: EngineTruth): string {
  const { games, ...head } = truth;
  const out = ["{"];
  for (const [k, v] of Object.entries(head))
    out.push(`  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  out.push('  "games": {');
  const ids = Object.keys(games) as GameId[];
  ids.forEach((id, gi) => {
    const depths = Object.entries(games[id].depths);
    out.push(
      `    ${JSON.stringify(id)}: {`,
      `      "pgnFile": ${JSON.stringify(games[id].pgnFile)},`,
      '      "depths": {'
    );
    depths.forEach(([d, positions], di) => {
      out.push(`        ${JSON.stringify(d)}: [`);
      positions.forEach((p, pi) =>
        out.push(
          `          ${JSON.stringify(p)}${pi < positions.length - 1 ? "," : ""}`
        )
      );
      out.push(`        ]${di < depths.length - 1 ? "," : ""}`);
    });
    out.push("      }", `    }${gi < ids.length - 1 ? "," : ""}`);
  });
  out.push("  }", "}");
  return `${out.join("\n")}\n`;
}

describe.skipIf(!REGEN)(
  "engine truth (slow: regenerates engine-truth.json)",
  () => {
    it(
      "re-runs every position of both games with a native Stockfish",
      async () => {
        const uci = new Uci();
        let idName = "";
        uci.send("uci");
        await uci.until(
          (l) => l === "uciok",
          (l) => {
            if (l.startsWith("id name ")) idName = l.slice("id name ".length);
          }
        );
        const [engineName, version] = [
          idName.split(" ")[0],
          idName.split(" ")[1] ?? "unknown",
        ];
        uci.send(`setoption name Threads value ${THREADS}`);
        uci.send(`setoption name Hash value ${HASH_MB}`);
        uci.send(`setoption name MultiPV value ${MULTI_PV}`);

        const games = {} as EngineTruth["games"];
        for (const id of Object.keys(GAME_FILES) as GameId[]) {
          const game = loadGame(id);
          const depths: Record<string, TruthPosition[]> = {};
          for (const depth of DEPTHS) {
            const out: TruthPosition[] = [];
            for (let ply = 0; ply < game.fens.length; ply++) {
              const fen = game.fens[ply];
              const probe = new Chess(fen);
              const base = { ply, fen, engineName, version, depth };
              if (probe.isCheckmate() || probe.isStalemate()) {
                out.push({
                  ...base,
                  bestMove: null,
                  evalCp: null,
                  mateIn: null,
                  pv: [],
                  lines: [],
                  terminal: probe.isCheckmate() ? "checkmate" : "stalemate",
                });
                continue;
              }
              const { bestMove, lines } = await analyse(uci, fen, depth);
              const top = lines[0];
              out.push({
                ...base,
                bestMove,
                evalCp: top?.evalCp ?? null,
                mateIn: top?.mateIn ?? null,
                pv: top?.pv ?? [],
                lines,
              });
            }
            depths[String(depth)] = out;
          }
          games[id] = { pgnFile: GAME_FILES[id], depths };
        }
        uci.quit();

        const truth: EngineTruth = {
          about:
            "Engine truth for the coach-accuracy regression games (docs/coach-accuracy-notes.md). One record per position (ply = plies played). Evaluations are from White's point of view; lines are best-first for the side to move, like the browser's PositionEval. Native Stockfish, one thread, ucinewgame before every position; depth 16 stands in for the browser's pass 1 (Stockfish 17 Lite, so not identical), depth 20 for the re-check. Regenerate with COACH_TRUTH_REGEN=1 npx vitest run src/lib/coach/__tests__/engineTruth.regen.test.ts.",
          engineName,
          version,
          threads: THREADS,
          hashMb: HASH_MB,
          multiPv: MULTI_PV,
          pov: "white",
          games,
        };
        const body = serialize(truth);
        expect(JSON.parse(body)).toEqual(truth);
        fs.writeFileSync(ENGINE_TRUTH_FILE, body);
        expect(truth.games.gameB.depths["20"]).toHaveLength(44);
      },
      40 * 60_000
    );
  }
);

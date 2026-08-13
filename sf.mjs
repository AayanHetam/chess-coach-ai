import { spawn } from "node:child_process";

export function analyse(fen, { depth = 16, multipv = 1, searchmoves = null } = {}) {
  return new Promise((resolve, reject) => {
    const sf = spawn("stockfish");
    let buf = "";
    const lines = new Map();
    let bestmove = null;
    sf.stdout.on("data", (d) => {
      buf += d.toString();
      const parts = buf.split("\n");
      buf = parts.pop();
      for (const raw of parts) {
        const l = raw.trim();
        if (l.startsWith("info ") && l.includes(" pv ")) {
          const m = /multipv (\d+)/.exec(l);
          const idx = m ? Number(m[1]) : 1;
          const dm = /\bdepth (\d+)/.exec(l);
          const sc = /score (cp|mate) (-?\d+)/.exec(l);
          const pv = /\bpv (.+)$/.exec(l);
          if (sc && pv) {
            lines.set(idx, {
              depth: dm ? Number(dm[1]) : null,
              cp: sc[1] === "cp" ? Number(sc[2]) : null,
              mate: sc[1] === "mate" ? Number(sc[2]) : null,
              pv: pv[1].trim().split(/\s+/),
            });
          }
        }
        if (l.startsWith("bestmove")) {
          bestmove = l.split(/\s+/)[1];
          sf.stdin.write("quit\n");
          resolve({
            bestmove,
            lines: [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([i, v]) => ({ multipv: i, ...v })),
          });
        }
      }
    });
    sf.on("error", reject);
    sf.stdin.write("uci\n");
    sf.stdin.write("setoption name Threads value 4\n");
    sf.stdin.write("setoption name MultiPV value " + multipv + "\n");
    sf.stdin.write("isready\n");
    sf.stdin.write("position fen " + fen + "\n");
    sf.stdin.write("go depth " + depth + (searchmoves ? " searchmoves " + searchmoves : "") + "\n");
  });
}

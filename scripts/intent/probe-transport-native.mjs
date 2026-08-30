// Native-stockfish transport for probe-recipe.mjs. Same engine handling as
// probe-corpus.mjs (privately-named binary, unconsumed-stderr guard,
// handshake on every spawn); the recipe supplies all protocol logic.
import { spawn } from "node:child_process";

export function makeNativeTransport({ enginePath = process.env.ENGINE || "/tmp/sf_probe_worker" } = {}) {
  const engines = {};
  const lineCbs = { real: [], prober: [] };
  const deathCbs = { real: [], prober: [] };
  let shuttingDown = false;

  function spawnOne(which) {
    const child = spawn(enginePath);
    let buf = "";
    child.stderr.on("data", () => {}); // an unconsumed stderr pipe can block the engine
    child.stdout.on("data", (d) => {
      buf += d.toString();
      const parts = buf.split("\n");
      buf = parts.pop();
      for (const raw of parts) {
        const l = raw.trim();
        for (const cb of lineCbs[which]) cb(l);
      }
    });
    child.on("exit", () => {
      if (shuttingDown) return;
      for (const cb of deathCbs[which]) cb(new Error(`${which} engine died mid-search`));
    });
    child.stdin.on("error", () => {});
    child.stdin.write("uci\nisready\nucinewgame\nisready\n");
    engines[which] = child;
  }

  spawnOne("real");
  spawnOne("prober");

  return {
    send(which, cmd) { engines[which].stdin.write(cmd + "\n"); },
    onLine(which, cb) { lineCbs[which].push(cb); },
    onDeath(which, cb) { deathCbs[which].push(cb); },
    async restart() {
      for (const which of ["real", "prober"]) {
        try { engines[which].kill("SIGKILL"); } catch { /* already gone */ }
        spawnOne(which);
      }
      await new Promise((r) => setTimeout(r, 400));
    },
    async quit() {
      shuttingDown = true;
      for (const which of ["real", "prober"]) {
        try { engines[which].stdin.write("quit\n"); } catch { /* gone */ }
      }
    },
  };
}

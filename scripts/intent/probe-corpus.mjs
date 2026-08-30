// Build engine-backed IntentProbe inputs for a corpus of games with NATIVE
// stockfish — the calibration reference instrument (SF 17.1, single thread,
// depth 16, MultiPV 3, warm table on the gameEval mirror).
//
//   DEPTH=16 node scripts/intent/probe-corpus.mjs <games.json> [out.json]
//
// The orchestration lives in probe-recipe.mjs, shared byte-for-byte with the
// lite-WASM sweep (probe-corpus-lite.mjs) so the two runs differ in exactly
// one thing: the engine. The split was verified by a control — the extracted
// recipe over the native transport reproduces the pre-split monolith's output
// byte-identically on game_01 (37 plies, 260 searches).
//
// THREADS IS DELIBERATELY NEVER SET. Grep of src/ finds no `setoption name
// Threads` on the client path, so production runs at Stockfish's default of
// 1. Single-threaded search is also deterministic, which makes every number
// here reproducible; an earlier probe generation set 6 threads and then
// attributed the resulting variance to "multithreaded nondeterminism".
//
// GAMES_JSON: a coach_runs-style JSON with the games to probe (file,
// playerColor, moves[]). OUT: where the probe corpus accumulates (resumable —
// re-running picks up from the checkpoint). Both are local artifacts; game
// data never enters the repo.
import { loadGames, runProbeSweep } from "./probe-recipe.mjs";
import { makeNativeTransport } from "./probe-transport-native.mjs";

const GAMES_JSON = process.env.GAMES_JSON || process.argv[2];
const OUT = process.env.OUT || process.argv[3] || "probes.json";
const DEPTH = Number(process.env.DEPTH || 16);
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map((s) => s.trim()) : null;
if (!GAMES_JSON) {
  console.error("usage: node scripts/intent/probe-corpus.mjs <games.json> [out.json]");
  process.exit(1);
}

const games = loadGames(GAMES_JSON, ONLY);
const stats = await runProbeSweep({
  games,
  out: OUT,
  depth: DEPTH,
  transport: makeNativeTransport(),
});
console.error("native sweep:", JSON.stringify(stats));
process.exit(0);

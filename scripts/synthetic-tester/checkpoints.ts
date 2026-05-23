import { Chess } from "chess.js";
import { MoveClassification } from "../../src/types/enums";
import { StockfishEngine, normalizeEval, type EngineScore } from "./stockfish";

export interface PerPlyState {
  ply: number;            // 1-indexed (number of half-moves played to reach fenAfter)
  fenBefore: string;
  fenAfter: string;
  sanMove: string;
  evalBefore: number;     // normalized cp (White POV)
  evalAfter: number;      // normalized cp (White POV)
  swing: number;          // |evalAfter - evalBefore|
  moverIsWhite: boolean;
  rawScoreAfter: EngineScore;
}

export type CheckpointKind = "swing" | "quiet" | "opening" | "endgame";

export interface Checkpoint {
  ply: number;
  kind: CheckpointKind;
  classification: MoveClassification;
  state: PerPlyState;
}

/**
 * Run engine over every ply of a PGN. Returns an entry per move played.
 * `depth` defaults to 14 (~150ms/position).
 */
export async function evaluateGame(
  pgn: string,
  engine: StockfishEngine,
  depth = 14
): Promise<{ states: PerPlyState[]; chessjsHistory: string[]; startingScore: EngineScore }> {
  const game = new Chess();
  game.loadPgn(pgn, { strict: false }); // throws on failure in chess.js v1.x
  const history = game.history({ verbose: true });

  // Replay from start, capturing FEN before/after each move.
  const replay = new Chess();
  const startingEvalRes = await engine.evaluate(replay.fen(), depth);
  const startingScore = startingEvalRes.score;
  let prevEval = normalizeEval(startingScore);

  const states: PerPlyState[] = [];
  for (let i = 0; i < history.length; i++) {
    const m = history[i];
    const fenBefore = replay.fen();
    const moverIsWhite = replay.turn() === "w";
    const result = replay.move({ from: m.from, to: m.to, promotion: m.promotion });
    if (!result) throw new Error(`replay failed at ply ${i + 1}: ${m.san}`);
    const fenAfter = replay.fen();

    const evalRes = await engine.evaluate(fenAfter, depth);
    const evalAfter = normalizeEval(evalRes.score);

    states.push({
      ply: i + 1,
      fenBefore,
      fenAfter,
      sanMove: result.san,
      evalBefore: prevEval,
      evalAfter,
      swing: Math.abs(evalAfter - prevEval),
      moverIsWhite,
      rawScoreAfter: evalRes.score,
    });
    prevEval = evalAfter;
  }
  return { states, chessjsHistory: history.map((h) => h.san), startingScore };
}

/**
 * Classify a move from the swing in centipawns from the mover's POV.
 *
 * NOTE: The production code uses Chess.com win-percentage thresholds
 * ([src/lib/engine/helpers/moveClassification.ts](../../src/lib/engine/helpers/moveClassification.ts)).
 * For Phase 1 checkpoint labeling we use the simpler cp-swing approximation
 * below; this is acceptable because the label is descriptive metadata, not
 * something the LLM sees. A future Phase can swap in the production classifier.
 */
export function classifyBySwing(swing: number): MoveClassification {
  if (swing >= 300) return MoveClassification.Blunder;
  if (swing >= 150) return MoveClassification.Mistake;
  if (swing >= 50) return MoveClassification.Inaccuracy;
  return MoveClassification.Okay;
}

/**
 * Pick checkpoints per the plan §6 distribution:
 *   60% from highest-swing positions (swing > 100 cp)
 *   20% quiet middlegame (move 15-25, swing < 30)
 *   20% spread across opening (ply <= 20) / endgame (last 20% of plies)
 *
 * `seed` is forwarded to a tiny mulberry32 RNG so the same (game, N, seed)
 * always produces the same checkpoint set — important for reproducibility.
 */
export function pickCheckpoints(
  states: PerPlyState[],
  n: number,
  seed: number
): Checkpoint[] {
  if (n <= 0 || states.length === 0) return [];
  const rng = mulberry32(seed);
  const totalPlies = states.length;

  const nSwing = Math.max(1, Math.ceil(n * 0.6));
  const nQuiet = Math.max(0, Math.floor(n * 0.2));
  const nSpread = Math.max(0, n - nSwing - nQuiet);

  const used = new Set<number>();
  const picks: Checkpoint[] = [];

  // Swings: sort by descending swing, take top N where swing > 100.
  const swings = [...states]
    .filter((s) => s.swing > 100)
    .sort((a, b) => b.swing - a.swing)
    .slice(0, nSwing);
  for (const s of swings) {
    if (used.has(s.ply)) continue;
    used.add(s.ply);
    picks.push({ ply: s.ply, kind: "swing", classification: classifyBySwing(s.swing), state: s });
  }

  // Quiet: middlegame plies 30-50 with swing < 30.
  const quiet = states.filter(
    (s) => s.ply >= 30 && s.ply <= 50 && s.swing < 30 && !used.has(s.ply)
  );
  shuffleInPlace(quiet, rng);
  for (const s of quiet.slice(0, nQuiet)) {
    used.add(s.ply);
    picks.push({ ply: s.ply, kind: "quiet", classification: classifyBySwing(s.swing), state: s });
  }

  // Spread: alternate opening / endgame buckets.
  const openingPool = states.filter((s) => s.ply <= 20 && !used.has(s.ply));
  const endgameThreshold = Math.floor(totalPlies * 0.8);
  const endgamePool = states.filter((s) => s.ply > endgameThreshold && !used.has(s.ply));
  shuffleInPlace(openingPool, rng);
  shuffleInPlace(endgamePool, rng);

  for (let i = 0; i < nSpread; i++) {
    const useOpening = i % 2 === 0;
    const pool = useOpening ? openingPool : endgamePool;
    const fallback = useOpening ? endgamePool : openingPool;
    const pick = pool.shift() || fallback.shift();
    if (!pick) break;
    used.add(pick.ply);
    picks.push({
      ply: pick.ply,
      kind: useOpening ? "opening" : "endgame",
      classification: classifyBySwing(pick.swing),
      state: pick,
    });
  }

  // Bucket-spread fallback if we still have room (e.g. all-quiet game).
  if (picks.length < n) {
    const remaining = states.filter((s) => !used.has(s.ply));
    shuffleInPlace(remaining, rng);
    for (const s of remaining.slice(0, n - picks.length)) {
      used.add(s.ply);
      picks.push({
        ply: s.ply,
        kind: s.swing > 100 ? "swing" : "quiet",
        classification: classifyBySwing(s.swing),
        state: s,
      });
    }
  }

  return picks.sort((a, b) => a.ply - b.ply);
}

// ── deterministic helpers ───────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

#!/usr/bin/env node
/**
 * Generate the FROZEN helpfulness eval set (Phase 1 hardening).
 *
 * License-clean sources only: chess positions/moves are uncopyrightable facts —
 * master-game move sequences (scripts/synthetic-tester/games/) and self-authored
 * fixtures (relationalFixtures.ts). NO human annotation text is used.
 *
 * Deterministic (fixed seed + Stockfish). Picks multiple checkpoints per game to
 * span kinds (swing/blunder, quiet/best, opening, endgame) and cycles rating
 * tiers. No product-API spend — Stockfish only.
 *
 *   npx tsx scripts/synthetic-tester/buildHelpfulnessEvalSet.ts
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { StockfishEngine } from "./stockfish";
import { evaluateGame, classifyBySwing } from "./checkpoints";
import { RELATIONAL_FIXTURES } from "./relationalFixtures";

const SEED = 20260619;
const DEPTH = 10; // selection only — swing classification doesn't need deep eval
const RATING_CYCLE = [800, 1400, 1800]; // even thirds: beginner / intermediate / advanced

function tierOf(r: number): "beginner" | "intermediate" | "advanced" {
  return r < 1000 ? "beginner" : r < 1600 ? "intermediate" : "advanced";
}

interface EvalEntry {
  id: string;
  source: string;
  moveHistory: string[];
  movePlayedSan: string;
  fenBefore: string;
  fenAfter: string;
  playerColor: "w" | "b";
  userRating: number;
  tier: string;
  kind: string;
  classification: string;
  swingCp: number;
}

async function main() {
  const sources: { id: string; pgn: string }[] = [];
  // self-authored fixtures first (fast), then master games (diversity)
  for (const fx of RELATIONAL_FIXTURES) sources.push({ id: `fx-${fx.id}`, pgn: fx.pgn });
  const gamesDir = join("scripts", "synthetic-tester", "games");
  if (existsSync(gamesDir)) {
    for (const f of readdirSync(gamesDir).filter((x) => x.endsWith(".pgn")).sort()) {
      sources.push({ id: f.replace(/\.pgn$/, ""), pgn: readFileSync(join(gamesDir, f), "utf8") });
    }
  }

  const sf = new StockfishEngine();
  await sf.init();
  const entries: EvalEntry[] = [];
  let ratingIdx = 0;
  try {
    for (const src of sources) {
      let states: Awaited<ReturnType<typeof evaluateGame>>["states"];
      let chessjsHistory: string[];
      try {
        ({ states, chessjsHistory } = await evaluateGame(src.pgn, sf, DEPTH));
      } catch {
        console.warn(`skip ${src.id} (eval failed)`);
        continue;
      }
      if (!states || states.length < 2) continue;
      // Balance kinds: one ERROR (max-swing blunder/mistake) + one BEST (min-swing
      // well-played move), past the opening, so the dim-2 "move was best" path is
      // exercised alongside the dim-2 "diagnose the mistake" path.
      const pool = states.filter((s) => s.ply >= 3);
      const ranked = [...(pool.length >= 2 ? pool : states)].sort((a, b) => b.swing - a.swing);
      const errState = ranked[0];
      const bestState = ranked[ranked.length - 1];
      const picks = errState.ply === bestState.ply ? [errState] : [errState, bestState];
      for (let i = 0; i < picks.length; i++) {
        const s = picks[i];
        const userRating = RATING_CYCLE[ratingIdx++ % RATING_CYCLE.length];
        entries.push({
          id: `${src.id}#${s.ply}`,
          source: src.id,
          moveHistory: chessjsHistory.slice(0, s.ply),
          movePlayedSan: s.sanMove,
          fenBefore: s.fenBefore,
          fenAfter: s.fenAfter,
          playerColor: s.moverIsWhite ? "w" : "b",
          userRating,
          tier: tierOf(userRating),
          kind: i === 0 ? "error" : "best",
          classification: String(classifyBySwing(s.swing)),
          swingCp: Math.round(s.swing),
        });
      }
      console.log(`${src.id}: +${picks.length} (total ${entries.length})`);
    }
  } finally {
    sf.close();
  }

  const outDir = join("scripts", "synthetic-tester", "fixtures", "helpfulness");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "eval-set-50.json");
  writeFileSync(outPath, JSON.stringify({ seed: SEED, depth: DEPTH, count: entries.length, entries }, null, 2));

  const byTier: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const e of entries) {
    byTier[e.tier] = (byTier[e.tier] || 0) + 1;
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  }
  console.log(`\nwrote ${entries.length} entries -> ${outPath}`);
  console.log("by tier:", byTier);
  console.log("by kind:", byKind);
  console.log("teach-the-error (blunder/mistake/inaccuracy):", entries.filter((e) => /blunder|mistake|inaccuracy/i.test(e.classification)).length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

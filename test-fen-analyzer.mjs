#!/usr/bin/env node
/**
 * Test the FEN analysis engine locally (no Neo4j needed).
 */
import { analyzePuzzle } from "./scripts/neo4j-loaders/fen-analyzer.mjs";

const testPuzzles = [
  {
    name: "Fork puzzle (crushing hangingPiece long middlegame)",
    puzzleId: "000bO",
    fen: "r1b2rk1/ppp2ppp/8/4N3/2Pn1q2/P7/1B3PPP/R2Q1RK1 w - - 0 16",
    moves: "e5d7 f4d2 d7f8",
    themes: ["advantage", "fork", "middlegame", "short"],
  },
  {
    name: "Mate in 2 (crushing endgame mate mateIn2 short)",
    puzzleId: "000bJ",
    fen: "2r2k2/5p2/p2P2p1/1p1R3p/6P1/P4P1P/1P6/2R3K1 b - - 0 34",
    moves: "c8c1 g1h2 c1h1",
    themes: ["crushing", "endgame", "mate", "mateIn2", "short"],
  },
  {
    name: "Zugzwang (crushing endgame short zugzwang)",
    puzzleId: "000bu",
    fen: "5rk1/pp3p1p/2p3p1/3p4/3P4/2P1KP2/PP6/R7 b - - 0 30",
    moves: "f8e8 e3d2 e8e2 d2c1",
    themes: ["crushing", "endgame", "short", "zugzwang"],
  },
  {
    name: "Sacrifice + advantage",
    puzzleId: "000aP",
    fen: "rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N2N2/PP2PPPP/R2QKB1R w KQkq - 0 5",
    moves: "f3e5 b8d7 e5f7",
    themes: ["advantage", "middlegame", "sacrifice", "short"],
  },
];

console.log("🔬 FEN Analysis Engine Test\n");
console.log("=".repeat(70));

for (const puzzle of testPuzzles) {
  console.log(`\n📋 ${puzzle.name}`);
  console.log(`   Lichess tags: [${puzzle.themes.join(", ")}]`);

  const result = analyzePuzzle(puzzle);

  console.log(`   Specific themes: [${result.tacticalThemes.join(", ")}]`);
  console.log(`   Metadata:`);
  console.log(`     evaluation: ${result.metadata.evaluation || "—"}`);
  console.log(`     gamePhase: ${result.metadata.gamePhase || "—"}`);
  console.log(`     puzzleLength: ${result.metadata.puzzleLength || "—"}`);
  console.log(`     difficulty: ${result.metadata.difficulty || "—"}`);
  console.log(`     isMate: ${result.metadata.isMate}`);
  console.log(`     mateInMoves: ${result.metadata.mateInMoves || "—"}`);
  console.log("─".repeat(70));
}

console.log("\n✅ FEN Analysis Engine test complete!");

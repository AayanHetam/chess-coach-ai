#!/usr/bin/env node
/**
 * Puzzle Matching Test Harness
 *
 * Verifies that /api/similar-puzzles returns puzzles whose themes match
 * the requested concept. This is the "need to have" — the model MUST
 * return puzzles that test the right skill. FEN similarity is nice-to-have.
 *
 * For each test case:
 *   1. Request puzzles for a concept + reference FEN
 *   2. Check how many returned puzzles include the expected theme(s)
 *   3. Report per-concept and overall accuracy
 *
 * Usage:
 *   npm run dev            # in one terminal
 *   node scripts/test-puzzle-matching.mjs
 *   node scripts/test-puzzle-matching.mjs --host=http://localhost:3000
 *   node scripts/test-puzzle-matching.mjs --limit=10
 */

const HOST =
  process.argv.find((a) => a.startsWith("--host="))?.split("=")[1] ||
  "http://localhost:3000";
const LIMIT = parseInt(
  process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "10",
  10
);

// ─────────────────────────────────────────────────────────────────────────────
// Test cases: concept, requested theme IDs, and a reference FEN for similarity.
// For each case, at minimum one of the expectedThemes should appear in every
// returned puzzle's theme list (need-to-have). FEN similarity score is reported
// but does not affect pass/fail (nice-to-have).
// ─────────────────────────────────────────────────────────────────────────────
const TEST_CASES = [
  {
    id: "knight-fork-middlegame",
    concept: "Knight fork in the middlegame",
    requestedThemes: ["knight-fork", "fork"],
    expectedThemes: ["knight-fork", "fork"], // at least one must appear
    referenceFen:
      "r1bq1rk1/pp3ppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2Q1RK1 w - - 0 9",
    userRating: 1500,
  },
  {
    id: "back-rank-mate",
    concept: "Back-rank mate with a rook",
    requestedThemes: ["back-rank-mate", "back-rank"],
    expectedThemes: ["back-rank-mate", "back-rank"],
    referenceFen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
    userRating: 1400,
  },
  {
    id: "pin-tactic",
    concept: "Pin tactics (absolute or relative)",
    requestedThemes: ["pin", "absolute-pin"],
    expectedThemes: ["pin", "absolute-pin", "relative-pin"],
    referenceFen: "r3k2r/pp3ppp/2p2n2/3p4/1b1P4/2N1PN2/PP3PPP/R1BQ1RK1 w kq - 0 10",
    userRating: 1500,
  },
  {
    id: "skewer",
    concept: "Skewer tactics",
    requestedThemes: ["skewer"],
    expectedThemes: ["skewer"],
    referenceFen: "8/8/3k4/8/8/3K4/4B3/3r4 w - - 0 1",
    userRating: 1500,
  },
  {
    id: "discovered-attack",
    concept: "Discovered attack",
    requestedThemes: ["discovered-attack"],
    expectedThemes: ["discovered-attack", "discovered-check"],
    referenceFen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/3B4/PPPP1PPP/RNBQK1NR w KQkq - 2 3",
    userRating: 1500,
  },
  {
    id: "hanging-piece",
    concept: "Hanging piece / simple capture",
    requestedThemes: ["hanging-piece"],
    expectedThemes: ["hanging-piece"],
    referenceFen: "r2q1rk1/ppp2ppp/2n1bn2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 8",
    userRating: 1300,
  },
  {
    id: "sacrifice",
    concept: "Piece sacrifice for attack",
    requestedThemes: ["sacrifice"],
    expectedThemes: ["sacrifice"],
    referenceFen: "r1bqk2r/ppp2ppp/2n1pn2/3p4/1b1P4/2NBPN2/PPP2PPP/R1BQK2R w KQkq - 0 6",
    userRating: 1700,
  },
  {
    id: "mate-in-2",
    concept: "Mate in 2",
    requestedThemes: ["mate-in-2"],
    expectedThemes: ["mate-in-2"],
    referenceFen: "r4rk1/ppp2ppp/8/8/2B5/8/PPP2PPP/R3R1K1 w - - 0 1",
    userRating: 1400,
  },
  {
    id: "mate-in-3",
    concept: "Mate in 3",
    requestedThemes: ["mate-in-3"],
    expectedThemes: ["mate-in-3"],
    referenceFen: "r4rk1/ppp2ppp/8/8/2B5/8/PPP2PPP/R3R1K1 w - - 0 1",
    userRating: 1700,
  },
  {
    id: "endgame-rook",
    concept: "Rook endgame technique",
    requestedThemes: ["rook-endgame"],
    expectedThemes: ["rook-endgame"],
    referenceFen: "8/5pk1/6p1/7p/8/6P1/5PKP/4R3 w - - 0 1",
    userRating: 1600,
  },
  {
    id: "deflection",
    concept: "Deflection tactic",
    requestedThemes: ["deflection"],
    expectedThemes: ["deflection"],
    referenceFen: "r1bq1rk1/pp3ppp/2n2n2/2bp4/3Pp3/2PBPN2/PP3PPP/R1BQ1RK1 w - - 0 10",
    userRating: 1600,
  },
  {
    id: "attraction",
    concept: "Attraction/decoy",
    requestedThemes: ["attraction"],
    expectedThemes: ["attraction"],
    referenceFen: "r1bq1rk1/pp3ppp/2n2n2/2bp4/3Pp3/2PBPN2/PP3PPP/R1BQ1RK1 w - - 0 10",
    userRating: 1700,
  },
  {
    id: "double-check",
    concept: "Double check",
    requestedThemes: ["double-check"],
    expectedThemes: ["double-check"],
    referenceFen: "r1bqk2r/ppp2ppp/2n1pn2/3p4/1b1P4/2N2N2/PPP1BPPP/R1BQK2R w KQkq - 0 7",
    userRating: 1700,
  },
  {
    id: "kingside-attack",
    concept: "Kingside attack",
    requestedThemes: ["kingside-attack"],
    expectedThemes: ["kingside-attack"],
    referenceFen: "r1bq1rk1/ppp2ppp/2n2n2/3p4/3P4/2NBPN2/PPP2PPP/R1BQ1RK1 w - - 0 8",
    userRating: 1600,
  },
  {
    id: "advanced-pawn",
    concept: "Advanced passed pawn",
    requestedThemes: ["advanced-pawn"],
    expectedThemes: ["advanced-pawn"],
    referenceFen: "8/1p3pk1/1P4p1/4P2p/8/6PK/5P1P/8 w - - 0 1",
    userRating: 1500,
  },
];

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

async function runCase(tc) {
  const started = Date.now();
  const res = await fetch(`${HOST}/api/similar-puzzles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fen: tc.referenceFen,
      themes: tc.requestedThemes,
      userRating: tc.userRating,
      limit: LIMIT,
      candidatePoolSize: Math.max(80, LIMIT * 6),
    }),
  });

  const elapsedMs = Date.now() - started;

  if (!res.ok) {
    const text = await res.text();
    return {
      ...tc,
      ok: false,
      error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
      elapsedMs,
    };
  }

  const data = await res.json();
  const puzzles = data.puzzles || [];

  // Need-to-have: does each puzzle have at least one expected theme?
  const matchingCount = puzzles.filter((p) =>
    (p.themes || []).some((t) => tc.expectedThemes.includes(t))
  ).length;

  const themeAccuracy = puzzles.length > 0 ? matchingCount / puzzles.length : 0;

  // Nice-to-have: average FEN similarity
  const avgSimilarity =
    puzzles.length > 0
      ? puzzles.reduce((s, p) => s + (p.fenSimilarity ?? 0), 0) / puzzles.length
      : 0;

  // Side-to-move match rate (nice-to-have)
  const turnMatchRate =
    puzzles.length > 0
      ? puzzles.filter((p) => p.turnMatch).length / puzzles.length
      : 0;

  return {
    ...tc,
    ok: true,
    puzzleCount: puzzles.length,
    matchingCount,
    themeAccuracy,
    avgSimilarity,
    turnMatchRate,
    poolSize: data.poolSize,
    elapsedMs,
    topExampleThemes: puzzles[0]?.themes || [],
    topExampleId: puzzles[0]?.puzzleId,
  };
}

async function main() {
  console.log(bold(`\n🧪 Puzzle Matching Test Harness`));
  console.log(dim(`   Target: ${HOST}/api/similar-puzzles`));
  console.log(dim(`   Limit per query: ${LIMIT}`));
  console.log(dim(`   Test cases: ${TEST_CASES.length}\n`));

  const results = [];
  for (const tc of TEST_CASES) {
    process.stdout.write(`  [${cyan(tc.id.padEnd(26))}] `);
    try {
      const r = await runCase(tc);
      results.push(r);

      if (!r.ok) {
        console.log(red(`FAIL — ${r.error}`));
        continue;
      }

      const accStr = `${(r.themeAccuracy * 100).toFixed(0)}%`;
      const tag =
        r.themeAccuracy === 1
          ? green("PASS ✓")
          : r.themeAccuracy >= 0.7
            ? yellow("WARN")
            : red("FAIL ✗");
      console.log(
        `${tag}  theme=${accStr.padStart(4)} fenSim=${r.avgSimilarity.toFixed(2)} turnMatch=${(r.turnMatchRate * 100).toFixed(0)}% n=${r.puzzleCount} pool=${r.poolSize} (${r.elapsedMs}ms)`
      );
    } catch (e) {
      console.log(red(`FAIL — ${e.message}`));
      results.push({ ...tc, ok: false, error: e.message });
    }
  }

  // Summary
  console.log(bold(`\n───────── Summary ─────────`));
  const completed = results.filter((r) => r.ok);
  const avgThemeAcc =
    completed.length > 0
      ? completed.reduce((s, r) => s + r.themeAccuracy, 0) / completed.length
      : 0;
  const avgFenSim =
    completed.length > 0
      ? completed.reduce((s, r) => s + r.avgSimilarity, 0) / completed.length
      : 0;
  const avgTurnMatch =
    completed.length > 0
      ? completed.reduce((s, r) => s + r.turnMatchRate, 0) / completed.length
      : 0;
  const passed = completed.filter((r) => r.themeAccuracy === 1).length;
  const partials = completed.filter(
    (r) => r.themeAccuracy >= 0.7 && r.themeAccuracy < 1
  ).length;
  const failed = completed.filter((r) => r.themeAccuracy < 0.7).length;
  const errored = results.length - completed.length;

  console.log(
    `  Total: ${results.length}   ${green(`Pass: ${passed}`)}   ${yellow(`Warn: ${partials}`)}   ${red(`Fail: ${failed}`)}   ${errored > 0 ? red(`Error: ${errored}`) : `Error: ${errored}`}`
  );
  console.log(
    `  Avg theme-match accuracy: ${bold(`${(avgThemeAcc * 100).toFixed(1)}%`)}`
  );
  console.log(
    `  Avg FEN similarity (nice-to-have): ${(avgFenSim * 100).toFixed(1)}%`
  );
  console.log(
    `  Avg side-to-move match: ${(avgTurnMatch * 100).toFixed(1)}%\n`
  );

  // Detailed per-case breakdown
  if (failed > 0 || partials > 0) {
    console.log(bold(`Cases needing attention:`));
    for (const r of completed.filter((r) => r.themeAccuracy < 1)) {
      console.log(
        `  ${r.id}: ${(r.themeAccuracy * 100).toFixed(0)}% (${r.matchingCount}/${r.puzzleCount})`
      );
      console.log(
        `    top example ${r.topExampleId} themes: ${JSON.stringify(r.topExampleThemes)}`
      );
    }
  }

  const exit = failed > 0 || errored > 0 ? 1 : 0;
  process.exit(exit);
}

main().catch((e) => {
  console.error(red("\n❌ Harness error:"), e);
  process.exit(2);
});

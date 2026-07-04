#!/usr/bin/env node
/**
 * Phase 0 baseline runner — measures the flagship coach's relational
 * hallucination rate with BOTH levers OFF.
 *
 * For each fixture: Stockfish-evaluate the short line, POST it to the real
 * /api/enhanced-analysis flagship turn, extract the coach's relational claims
 * (Haiku) and verify each against the board (chess.js). Emits a JSON report and
 * a human-readable summary; the per-claim detail lets you spot-check that the
 * counted contradictions are genuine (gate: human).
 *
 * Run from the repo root with the dev server up:
 *   npm run dev   # in another terminal (binds 127.0.0.1:3000)
 *   MASTERMIND_VALIDATORS_ENABLED=false npx tsx scripts/synthetic-tester/runRelationalBaseline.ts --max-cost 8
 *
 * Flags: --base-url <url> --max-cost <usd> --depth <n> --limit <n>
 *        --personality <id> --out <path>
 */
import { appendFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { config as loadDotenv } from "dotenv";

import { mintSessionCookie, makeRunUid } from "./auth";
import { StockfishEngine } from "./stockfish";
import { evaluateGame } from "./checkpoints";
import { buildGameEval, analyzeGame } from "./client";
import { CostTracker } from "./costTracker";
import { scoreCoachResponse, aggregate, type FixtureScore } from "./relationalScorer";
import { RELATIONAL_FIXTURES } from "./relationalFixtures";

loadDotenv({ path: ".env.local" });
loadDotenv(); // fall back to .env for ANTHROPIC_API_KEY

interface Args {
  baseUrl: string;
  maxCost: number;
  depth: number;
  limit: number;
  personality: string;
  out?: string;
  /** rough per-flagship-call cost added to the budget (server token usage is not visible locally) */
  flagshipUsd: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    baseUrl: get("base-url") || "http://127.0.0.1:3000",
    maxCost: parseFloat(get("max-cost") || "8"),
    depth: parseInt(get("depth") || "12", 10),
    limit: parseInt(get("limit") || String(RELATIONAL_FIXTURES.length), 10),
    personality: get("personality") || "friendly",
    out: get("out"),
    flagshipUsd: parseFloat(get("flagship-usd") || "0.08"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const sessionSecret = process.env.SESSION_SECRET;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!sessionSecret) {
    console.error("ABORT: SESSION_SECRET not set (needed to mint the session cookie).");
    process.exit(2);
  }
  if (!anthropicKey) {
    console.error("ABORT: ANTHROPIC_API_KEY not set (needed for the claim extractor).");
    process.exit(2);
  }

  const validatorsFlag = process.env.MASTERMIND_VALIDATORS_ENABLED;
  if (validatorsFlag && validatorsFlag !== "false" && validatorsFlag !== "0") {
    console.warn(
      `WARNING: MASTERMIND_VALIDATORS_ENABLED=${validatorsFlag} — this is NOT a clean baseline (levers should be OFF).`,
    );
  }

  const runId = `relbaseline-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const cookie = await mintSessionCookie(sessionSecret, {
    uid: makeRunUid(runId),
    email: "relbaseline@chessmasti.local",
  });

  const cost = new CostTracker(args.maxCost);
  const fixtures = RELATIONAL_FIXTURES.slice(0, args.limit);

  console.log(`\n=== Relational hallucination BASELINE (levers OFF) ===`);
  console.log(`fixtures=${fixtures.length}  baseUrl=${args.baseUrl}  depth=${args.depth}  maxCost=$${args.maxCost}\n`);

  const sf = new StockfishEngine();
  await sf.init();

  const scores: FixtureScore[] = [];
  let flagshipSpend = 0;

  try {
    for (const fx of fixtures) {
      if (cost.totalSpent() + flagshipSpend >= args.maxCost) {
        console.warn(`\nABORT: budget $${args.maxCost} reached.`);
        break;
      }
      process.stdout.write(`[${fx.id}] stockfish… `);
      const { states, chessjsHistory, startingScore } = await evaluateGame(fx.pgn, sf, args.depth);
      const finalFen = states[states.length - 1].fenAfter;
      const gameEval = buildGameEval(states, startingScore, args.depth);

      process.stdout.write(`analysis… `);
      const res = await analyzeGame({
        baseUrl: args.baseUrl,
        cookie,
        moveHistory: chessjsHistory,
        fen: finalFen,
        gameEval,
        playerColor: "w",
        userRating: 1500,
        personalityId: args.personality,
      });

      if (!res.ok || !res.initialAnalysis) {
        console.log(`✗ analysis failed: ${res.status} ${res.errorMessage ?? "no text"}`);
        scores.push({
          fixtureId: fx.id,
          fen: finalFen,
          extractorOk: false,
          extractorError: `analysis_failed: ${res.status} ${res.errorMessage ?? ""}`,
          totalClaims: 0,
          falseRelationalClaims: 0,
          trueClaims: 0,
          unverifiable: 0,
          details: [],
        });
        continue;
      }
      flagshipSpend += args.flagshipUsd;

      // Build ply→FEN map so the scorer can verify past-position claims against
      // the right board (removes position-anchoring artifacts from whole-game reviews).
      const fenMap: Record<number, string> = {};
      for (const s of states) {
        fenMap[s.ply] = s.fenAfter;
      }

      process.stdout.write(`scoring… `);
      const score = await scoreCoachResponse({
        apiKey: anthropicKey,
        coachText: res.initialAnalysis,
        fen: finalFen,
        costTracker: cost,
        fenMap,
        moveHistory: chessjsHistory,
      });
      scores.push({ ...score, fixtureId: fx.id, fen: finalFen });
      console.log(
        `false=${score.falseRelationalClaims} true=${score.trueClaims} unverifiable=${score.unverifiable}`,
      );
    }
  } finally {
    sf.close();
  }

  const report = aggregate(scores);
  const totalSpend = cost.totalSpent() + flagshipSpend;

  // ── human-readable summary (the early-checkpoint number) ──
  console.log(`\n=== BASELINE REPORT ===`);
  console.log(`fixtures scored:            ${report.fixtures}`);
  console.log(`fixtures with false claims: ${report.fixturesWithFalseClaims}`);
  console.log(`TOTAL false relational:     ${report.totalFalseRelationalClaims}`);
  console.log(`total true claims:          ${report.totalTrueClaims}`);
  console.log(`total unverifiable:         ${report.totalUnverifiable}`);
  console.log(`extractor/analysis failures:${report.extractorFailures}`);
  console.log(`est. spend (Haiku+flagship):$${totalSpend.toFixed(3)}`);

  // ── per-claim contradictions, for the human spot-check ──
  console.log(`\n--- contradictions to spot-check (real vs position-anchoring artifact) ---`);
  for (const s of report.perFixture) {
    const bad = s.details.filter((d) => d.verdict === "contradicted");
    if (bad.length === 0) continue;
    console.log(`\n[${s.fixtureId}]  fen: ${s.fen}`);
    for (const d of bad) {
      console.log(`  ✗ (${d.kind}) "${d.rawText}"`);
      console.log(`      → ${d.reason}`);
    }
  }

  // ── persist ──
  const runsDir = join("scripts", "synthetic-tester", "runs");
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  const outPath = args.out || join(runsDir, `${runId}.json`);
  writeFileSync(
    outPath,
    JSON.stringify({ runId, args, generatedAtNote: "stamp after run", report, totalSpend }, null, 2),
  );
  console.log(`\nreport written to ${outPath}`);

  if (existsSync(".loop")) {
    appendFileSync(join(".loop", "cost.log"), `${totalSpend.toFixed(4)}\n`);
  }

  console.log(
    `\nEARLY CHECKPOINT: ${report.totalFalseRelationalClaims} false relational claim(s) across ` +
      `${report.fixtures} fixtures. Spot-check the list above, then decide go/no-go on building the levers.`,
  );
}

main().catch((err) => {
  console.error("baseline run failed:", err);
  process.exit(1);
});

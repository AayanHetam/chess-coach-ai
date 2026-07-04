#!/usr/bin/env node
/**
 * LIVE helpfulness baseline — grades the CURRENT coach (no levers/teaching changes)
 * on the helpfulness rubric, so Phase 2 has a real "before" number.
 *
 * Per fixture (a short tactical game): run the flagship coach on the game ending
 * at its last move, build the grounding packet for that move, run the chess.js
 * GATE, then the live Claude jury. Fallback/timeout responses ("Still analyzing")
 * are detected and EXCLUDED from the score medians (a non-answer must not look
 * like a 0-or-high teaching score — it's just absent).
 *
 * Run from repo root WITH the dev server up:
 *   npm run dev   # another terminal
 *   npx tsx scripts/synthetic-tester/runHelpfulnessBaseline.ts --max-cost 6 --base-url http://127.0.0.1:3000
 */
import { appendFileSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { config as loadDotenv } from "dotenv";
import { Chess } from "chess.js";

import { mintSessionCookie, makeRunUid } from "./auth";
import { StockfishEngine } from "./stockfish";
import { evaluateGame } from "./checkpoints";
import { buildGameEval, analyzeGame } from "./client";
import { buildJudgePacket } from "./helpfulnessGrounding";
import { juryGrade } from "./helpfulnessJury";
import { scoreCoachResponse } from "./relationalScorer";
import { CostTracker } from "./costTracker";
import { RELATIONAL_FIXTURES } from "./relationalFixtures";
import type { DimId } from "./helpfulnessTypes";

loadDotenv({ path: ".env.local" });
loadDotenv();

interface Args {
  baseUrl: string;
  maxCost: number;
  depth: number;
  limit: number;
  userRating: number;
  evalSet?: string;
  out?: string;
  flagshipUsd: number;
}

function parseArgs(argv: string[]): Args {
  const get = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    baseUrl: get("base-url") || "http://127.0.0.1:3000",
    maxCost: parseFloat(get("max-cost") || "6"),
    depth: parseInt(get("depth") || "14", 10),
    limit: parseInt(get("limit") || "999", 10),
    userRating: parseInt(get("user-rating") || "1500", 10),
    evalSet: get("eval-set"),
    out: get("out"),
    flagshipUsd: parseFloat(get("flagship-usd") || "0.08"),
  };
}

/** Build a target list (id, pgn, userRating) from the frozen eval set or the
 *  fixtures. The frozen entries store a SAN moveHistory; chess.js reconstructs a
 *  valid PGN so the existing evaluateGame path works unchanged. */
function loadTargets(args: Args): Array<{ id: string; pgn: string; userRating: number }> {
  if (args.evalSet) {
    const data = JSON.parse(readFileSync(args.evalSet, "utf8")) as {
      entries: Array<{ id: string; moveHistory: string[]; userRating: number }>;
    };
    return data.entries.slice(0, args.limit).map((e) => {
      const c = new Chess();
      for (const m of e.moveHistory) c.move(m);
      return { id: e.id, pgn: c.pgn(), userRating: e.userRating };
    });
  }
  return RELATIONAL_FIXTURES.slice(0, args.limit).map((f) => ({
    id: f.id,
    pgn: f.pgn,
    userRating: args.userRating,
  }));
}

/**
 * Classify a non-coaching response so it is NOT scored as teaching. Two kinds:
 *  - "timeout_stub": the pipeline's timeout/"Still analyzing" stub.
 *  - "validator_fallback": the deterministic fallback.ts template (emitted when the
 *    LLM response fails the relational/eval validators and regeneration is
 *    exhausted). Its signature ("X lost its role as ...", "became <role>") never
 *    appears in real LLM coaching. THIS was previously scored as coaching and
 *    silently inflated the numbers — ~40% of sharp-position responses.
 * Returns null for a genuine LLM coaching response.
 */
export function fallbackReason(text: string): "timeout_stub" | "validator_fallback" | null {
  const t = text.trim();
  if (t.length < 40 || /still analyzing|still thinking|took longer than expected|ask again|rephrase/i.test(t)) {
    return "timeout_stub";
  }
  if (/lost its role as|became (defender|attacker|bad-bishop|good-bishop|overworked|trapped)\b/i.test(t)) {
    return "validator_fallback";
  }
  return null;
}

function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface FixtureRow {
  id: string;
  ok: boolean;
  reason?: string;
  cappedTotal?: number;
  normalized?: number;
  dims?: Record<number, number | null>; // dim -> EV or null if N/A
  // Persisted for calibration export (raters need the response + position context):
  coachText?: string;
  grounding?: {
    fen: string;
    movePlayedSan: string;
    bestMoveSan: string;
    evalDeltaCpMoverPov: number;
    classification: string;
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessionSecret = process.env.SESSION_SECRET;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!sessionSecret) return void console.error("ABORT: SESSION_SECRET not set.");
  if (!anthropicKey) return void console.error("ABORT: ANTHROPIC_API_KEY not set.");

  const runId = `helpbaseline-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const cookie = await mintSessionCookie(sessionSecret, {
    uid: makeRunUid(runId),
    email: "helpbaseline@chessmasti.local",
  });
  const cost = new CostTracker(args.maxCost);
  const targets = loadTargets(args);

  console.log(`\n=== LIVE helpfulness BASELINE (current coach) ===`);
  console.log(
    `source=${args.evalSet ?? "relational-fixtures"} targets=${targets.length} baseUrl=${args.baseUrl} depth=${args.depth} maxCost=$${args.maxCost}\n`,
  );

  const sf = new StockfishEngine();
  await sf.init();
  const rows: FixtureRow[] = [];
  let flagshipSpend = 0;

  try {
    for (const fx of targets) {
      if (cost.totalSpent() + flagshipSpend >= args.maxCost) {
        console.warn(`\nABORT: budget $${args.maxCost} reached.`);
        break;
      }
      process.stdout.write(`[${fx.id}] eval… `);
      const { states, chessjsHistory, startingScore } = await evaluateGame(fx.pgn, sf, args.depth);
      if (states.length === 0) {
        rows.push({ id: fx.id, ok: false, reason: "no_moves" });
        console.log("skip (no moves)");
        continue;
      }
      const lastIdx = states.length - 1;
      const fenAfter = states[lastIdx].fenAfter;
      const fenBefore = lastIdx === 0 ? new Chess().fen() : states[lastIdx - 1].fenAfter;
      const movePlayedSan = states[lastIdx].sanMove;
      const playerColor: "w" | "b" = states.length % 2 === 1 ? "w" : "b";
      const gameEval = buildGameEval(states, startingScore, args.depth);

      process.stdout.write("coach… ");
      const res = await analyzeGame({
        baseUrl: args.baseUrl,
        cookie,
        moveHistory: chessjsHistory,
        fen: fenAfter,
        gameEval,
        playerColor,
        userRating: fx.userRating,
        personalityId: "friendly",
      });
      if (!res.ok || !res.initialAnalysis) {
        rows.push({ id: fx.id, ok: false, reason: `analysis_failed:${res.status}` });
        console.log(`✗ analysis failed (${res.status})`);
        continue;
      }
      flagshipSpend += args.flagshipUsd;
      const fbReason = fallbackReason(res.initialAnalysis);
      if (fbReason) {
        rows.push({ id: fx.id, ok: false, reason: fbReason });
        console.log(`✗ non-coaching response (${fbReason}) — excluded from teaching score`);
        continue;
      }

      process.stdout.write("grounding… ");
      const packet = await buildJudgePacket({
        fenBefore,
        movePlayedSan,
        playerColor,
        userRating: fx.userRating,
        engine: sf,
        depth: args.depth,
      });
      const gate = await scoreCoachResponse({
        apiKey: anthropicKey,
        coachText: res.initialAnalysis,
        fen: fenAfter,
        costTracker: cost,
      });

      process.stdout.write("jury… ");
      const jury = await juryGrade({
        apiKey: anthropicKey,
        packet,
        coachText: res.initialAnalysis,
        gate,
        costTracker: cost,
      });

      const dims: Record<number, number | null> = {};
      for (const d of jury.aggregate.dims) dims[d.dim] = d.applicable ? d.expected : null;
      rows.push({
        id: fx.id,
        ok: true,
        cappedTotal: jury.aggregate.cappedTotal,
        normalized: jury.aggregate.normalized,
        dims,
        coachText: res.initialAnalysis,
        grounding: {
          fen: packet.fen,
          movePlayedSan: packet.movePlayedSan,
          bestMoveSan: packet.stockfish.bestMoveSan,
          evalDeltaCpMoverPov: packet.stockfish.evalDeltaCpMoverPov,
          classification: String(packet.stockfish.classification),
        },
      });
      console.log(`total=${jury.aggregate.cappedTotal.toFixed(1)}/14 norm=${jury.aggregate.normalized.toFixed(2)}`);
    }
  } finally {
    sf.close();
  }

  const graded = rows.filter((r) => r.ok);
  const dimMedians: Record<number, number> = {};
  for (let d = 1 as DimId; d <= 7; d++) {
    const vals = graded.map((r) => r.dims?.[d]).filter((v): v is number => typeof v === "number");
    dimMedians[d] = median(vals);
  }
  const totalSpend = cost.totalSpent() + flagshipSpend;

  const validatorFb = rows.filter((r) => r.reason === "validator_fallback").length;
  const timeoutFb = rows.filter((r) => r.reason === "timeout_stub").length;
  const errFb = rows.filter((r) => !r.ok && r.reason !== "validator_fallback" && r.reason !== "timeout_stub").length;
  const attempted = graded.length + validatorFb + timeoutFb; // exclude hard errors (502/no-moves) from the rate denominator
  const fbRatePct = attempted > 0 ? ((validatorFb + timeoutFb) / attempted) * 100 : 0;

  console.log(`\n=== HELPFULNESS BASELINE REPORT (current coach) ===`);
  console.log(`fixtures attempted:     ${rows.length}`);
  console.log(`graded (real coaching): ${graded.length}`);
  console.log(`FALLBACK RATE:          ${fbRatePct.toFixed(0)}%  (validator_fallback=${validatorFb}, timeout_stub=${timeoutFb})  <- robotic non-coaching, NOT scored`);
  console.log(`hard errors (502/etc):  ${errFb}`);
  console.log(`MEDIAN total (real):    ${median(graded.map((r) => r.cappedTotal!)).toFixed(2)} / 14`);
  const dimNames = ["", "correctness", "diagnostic", "insight", "actionability", "level-fit", "assist-calib", "focus"];
  for (let d = 1; d <= 7; d++) console.log(`  dim${d} ${dimNames[d].padEnd(13)} median EV: ${Number.isNaN(dimMedians[d]) ? "n/a" : dimMedians[d].toFixed(2)}`);
  console.log(`est. spend:             $${totalSpend.toFixed(3)}`);

  const runsDir = join("scripts", "synthetic-tester", "runs");
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  const outPath = args.out || join(runsDir, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify({ runId, args, rows, dimMedians, medianTotal: median(graded.map((r) => r.cappedTotal!)), totalSpend }, null, 2));
  console.log(`\nreport: ${outPath}`);
  if (existsSync(".loop")) appendFileSync(join(".loop", "cost.log"), `${totalSpend.toFixed(4)}\n`);

  console.log(
    `\nNOTE: uncalibrated jury (no human calibration yet) — treat as directional. ` +
      `${rows.length - graded.length} of ${rows.length} fixtures returned no real coaching (fallback/timeout) — that itself is a usefulness signal.`,
  );
}

// Only run when executed directly (so tests can import fallbackReason without
// triggering a full baseline run).
if (process.argv[1] && /runHelpfulnessBaseline/.test(process.argv[1])) {
  main().catch((e) => {
    console.error("baseline failed:", e);
    process.exit(1);
  });
}

#!/usr/bin/env node
/**
 * Offline helpfulness eval runner (the GRADE driver).
 *
 * Grades STORED coach responses on the 7-dimension helpfulness rubric (0-2 each,
 * max 14) using a Claude jury, grounded against Stockfish + the pure chess
 * grounding functions. It is OFFLINE by design: it reads ANTHROPIC_API_KEY and a
 * Stockfish binary (STOCKFISH_BIN), and NEVER POSTs to /api/* — it grades
 * fixtures that already contain the coach text.
 *
 * For each fixture { fenBefore, movePlayedSan, playerColor, userRating, coachText }:
 *   1. buildJudgePacket  (Stockfish multi-PV + motifs + concept-delta)
 *   2. GATE              (scoreCoachResponse: chess.js relational verifier vs fenAfter)
 *   3. juryGrade         (2 Claude models, EV-weighted, gate-composed)
 * and appends to a report JSON shaped like the relbaseline output.
 *
 * Run from the repo root (NO dev server needed):
 *   ANTHROPIC_API_KEY=... npx tsx scripts/synthetic-tester/runHelpfulnessEval.ts --max-cost 4
 *
 * Flags:
 *   --fixtures <dir>   default scripts/synthetic-tester/fixtures/helpfulness
 *   --max-cost <usd>   default 4
 *   --depth <n>        default 16
 *   --judges sonnet,haiku | all   default all (both jury models)
 *   --limit <n>        cap the number of fixtures
 *   --out <path>       default scripts/synthetic-tester/runs/helpful-<id>.json
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { config as loadDotenv } from "dotenv";

import { StockfishEngine } from "./stockfish";
import { buildJudgePacket } from "./helpfulnessGrounding";
import { juryGrade } from "./helpfulnessJury";
import { scoreCoachResponse } from "./relationalScorer";
import { CostTracker } from "./costTracker";
import type { JudgeModel } from "./helpfulnessJudge";
import type { JuryResult } from "./helpfulnessTypes";

loadDotenv({ path: ".env.local" });
loadDotenv(); // fall back to .env for ANTHROPIC_API_KEY

interface RunFixture {
  id: string;
  fenBefore: string;
  movePlayedSan: string;
  playerColor: "w" | "b";
  userRating: number;
  coachText: string;
  note?: string;
}

interface Args {
  fixturesDir: string;
  maxCost: number;
  depth: number;
  judges: JudgeModel[];
  limit: number;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const judgesArg = (get("judges") || "all").toLowerCase();
  let judges: JudgeModel[];
  if (judgesArg === "sonnet") judges = ["claude-sonnet-4-6"];
  else if (judgesArg === "haiku") judges = ["claude-haiku-4-5-20251001"];
  else judges = ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
  return {
    fixturesDir: get("fixtures") || join("scripts", "synthetic-tester", "fixtures", "helpfulness"),
    maxCost: parseFloat(get("max-cost") || "4"),
    depth: parseInt(get("depth") || "16", 10),
    judges,
    limit: parseInt(get("limit") || "9999", 10),
    out: get("out"),
  };
}

/** Load only files that have the runner-fixture shape (presence of fenBefore). */
function loadFixtures(dir: string): RunFixture[] {
  if (!existsSync(dir)) return [];
  const out: RunFixture[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      continue;
    }
    const o = parsed as Record<string, unknown>;
    if (
      typeof o.fenBefore === "string" &&
      typeof o.movePlayedSan === "string" &&
      (o.playerColor === "w" || o.playerColor === "b") &&
      typeof o.coachText === "string"
    ) {
      out.push({
        id: typeof o.id === "string" ? o.id : name.replace(/\.json$/, ""),
        fenBefore: o.fenBefore,
        movePlayedSan: o.movePlayedSan,
        playerColor: o.playerColor,
        userRating: typeof o.userRating === "number" ? o.userRating : 1500,
        coachText: o.coachText,
        note: typeof o.note === "string" ? o.note : undefined,
      });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    console.error("ABORT: ANTHROPIC_API_KEY not set (needed for the jury + GATE extractor).");
    process.exit(2);
  }

  const fixtures = loadFixtures(args.fixturesDir).slice(0, args.limit);
  if (fixtures.length === 0) {
    console.error(`ABORT: no runner fixtures found in ${args.fixturesDir}`);
    process.exit(2);
  }

  const runId = `helpful-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const cost = new CostTracker(args.maxCost);

  console.log(`\n=== Offline helpfulness eval (GRADE) ===`);
  console.log(
    `fixtures=${fixtures.length}  depth=${args.depth}  judges=${args.judges.join(",")}  maxCost=$${args.maxCost}\n`
  );

  const sf = new StockfishEngine();
  await sf.init();

  const perFixture: Array<{
    fixtureId: string;
    fen: string;
    note?: string;
    gate: { ok: boolean; falseRelationalClaims: number; trueClaims: number; unverifiable: number };
    juryResult: JuryResult;
  }> = [];

  try {
    for (const fx of fixtures) {
      if (cost.remaining() <= 0) {
        console.warn(`\nABORT: budget $${args.maxCost} reached.`);
        break;
      }
      process.stdout.write(`[${fx.id}] packet… `);
      const packet = await buildJudgePacket({
        fenBefore: fx.fenBefore,
        movePlayedSan: fx.movePlayedSan,
        playerColor: fx.playerColor,
        userRating: fx.userRating,
        engine: sf,
        depth: args.depth,
      });

      process.stdout.write(`gate… `);
      const gate = await scoreCoachResponse({
        apiKey: anthropicKey,
        coachText: fx.coachText,
        fen: packet.fenAfter,
        costTracker: cost,
      });

      process.stdout.write(`jury… `);
      const juryResult = await juryGrade({
        apiKey: anthropicKey,
        packet,
        coachText: fx.coachText,
        gate,
        costTracker: cost,
        judges: args.judges,
      });

      perFixture.push({
        fixtureId: fx.id,
        fen: fx.fenBefore,
        note: fx.note,
        gate: {
          ok: gate.extractorOk,
          falseRelationalClaims: gate.falseRelationalClaims,
          trueClaims: gate.trueClaims,
          unverifiable: gate.unverifiable,
        },
        juryResult,
      });

      const agg = juryResult.aggregate;
      console.log(
        `raw=${agg.rawTotal.toFixed(2)}/${agg.maxApplicable} capped=${agg.cappedTotal.toFixed(2)} ` +
          `norm=${agg.normalized.toFixed(2)} gate=${agg.gateApplied ? "CAPPED" : "ok"} ` +
          `false=${gate.falseRelationalClaims}`
      );
    }
  } finally {
    sf.close();
  }

  // ── summary ──
  console.log(`\n=== HELPFULNESS REPORT ===`);
  console.log(`fixtures scored:     ${perFixture.length}`);
  const meanNorm =
    perFixture.length > 0
      ? perFixture.reduce((s, f) => s + f.juryResult.aggregate.normalized, 0) / perFixture.length
      : 0;
  console.log(`mean normalized:     ${meanNorm.toFixed(3)}`);
  console.log(`gate-capped fixtures:${perFixture.filter((f) => f.juryResult.aggregate.gateApplied).length}`);
  console.log(`est. spend:          $${cost.totalSpent().toFixed(3)}`);

  // ── per-dimension breakdown (aggregate) for spot-check ──
  console.log(`\n--- per-fixture aggregate dims (EV per dimension) ---`);
  for (const f of perFixture) {
    const dimStr = f.juryResult.aggregate.dims
      .map((d) => `d${d.dim}=${d.applicable ? d.expected.toFixed(1) : "N/A"}`)
      .join(" ");
    console.log(`  [${f.fixtureId}] ${dimStr}  capped=${f.juryResult.aggregate.cappedTotal.toFixed(1)}`);
  }

  // ── persist (relbaseline-shaped) ──
  const runsDir = join("scripts", "synthetic-tester", "runs");
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  const outPath = args.out || join(runsDir, `${runId}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        runId,
        args,
        report: { fixtures: perFixture.length, meanNormalized: meanNorm, perFixture },
        totalSpend: cost.totalSpent(),
      },
      null,
      2
    )
  );
  console.log(`\nreport written to ${outPath}`);

  if (existsSync(".loop")) {
    appendFileSync(join(".loop", "cost.log"), `${cost.totalSpent().toFixed(4)}\n`);
  }
}

main().catch((err) => {
  console.error("helpfulness eval failed:", err);
  process.exit(1);
});

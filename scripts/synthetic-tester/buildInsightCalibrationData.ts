#!/usr/bin/env node
/**
 * Insight-aware calibration data builder.
 *
 * The original buildCalibrationData.ts emitted ONE item per fixture keyed off
 * the run's single artificial-checkpoint `grounding` move — but `coachText` is
 * a WHOLE-GAME review with many [INSIGHT] blocks. The rater was shown one
 * mismatched board against a multi-move response.
 *
 * This builder fixes that mismatch by splitting each coach response into the
 * units the coach actually emits:
 *   (1) one INSIGHT item per key move — board + move/best/classification come
 *       FROM THE INSIGHT TAG (the coach's own engine-grounded header), so the
 *       board and the prose always describe the same move. The fenBefore is
 *       derived from the fixture's moveHistory with the OFF-BY-ONE GUARD; an
 *       insight whose movePlayedSan is illegal from the derived FEN is DROPPED
 *       (never re-runs the coach or Stockfish).
 *   (2) one FULL-GAME item per fixture — the intro/overall prose, no board.
 *
 *   npx tsx scripts/synthetic-tester/buildInsightCalibrationData.ts \
 *     --run scripts/synthetic-tester/runs/helpbaseline-XXXX.json \
 *     [--eval-set scripts/synthetic-tester/fixtures/helpfulness/eval-set-50.json] \
 *     [--out public/calibration-data.json]
 */
import { readFileSync, writeFileSync } from "fs";
import { parseCoachInsights } from "./coachInsights";
import { deriveFenBefore, isLegalSan } from "./deriveInsightFen";

interface RunRow {
  id: string;
  ok?: boolean;
  coachText?: string;
}
interface EvalEntry {
  id: string;
  userRating: number;
  tier: string;
  moveHistory: string[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runPath = arg("run");
if (!runPath) {
  console.error("usage: --run <runJson> [--eval-set <json>] [--out <json>]");
  process.exit(2);
}
const evalPath =
  arg("eval-set") ||
  "scripts/synthetic-tester/fixtures/helpfulness/eval-set-50.json";
const out = arg("out") || "public/calibration-data.json";

const run = JSON.parse(readFileSync(runPath, "utf8")) as { rows: RunRow[] };
const ev = JSON.parse(readFileSync(evalPath, "utf8")) as {
  entries: EvalEntry[];
};
const byId = new Map<string, EvalEntry>(ev.entries.map((e) => [e.id, e]));

type Item = Record<string, unknown> & { type: "insight" | "full_game" };

const items: Item[] = [];
const dropped: { id: string; header: string; reason: string }[] = [];
const orphanIds: string[] = [];
let insightCount = 0;
let fullGameCount = 0;

for (const row of run.rows) {
  if (!row.coachText) continue;
  const entry = byId.get(row.id);
  if (!entry) {
    // Orphan: run row references an id absent from the eval-set. Skip the WHOLE
    // row (we can't derive any insight FEN without moveHistory) but never crash.
    orphanIds.push(row.id);
    continue;
  }

  const { fullGameAnalysis, insights } = parseCoachInsights(row.coachText);

  // (2) Full-game review item (no board / single-move card).
  if (fullGameAnalysis) {
    items.push({
      type: "full_game",
      id: `${row.id}#overall`,
      fullGameAnalysis,
      userRating: entry.userRating,
      tier: entry.tier,
    });
    fullGameCount += 1;
  }

  // (1) One item per insight, FEN derived with the off-by-one guard.
  for (const ins of insights) {
    const header = `${ins.moveNumber}:${ins.color}:${ins.classification}:${ins.evalBefore}:${ins.evalAfter}:${ins.movePlayedSan}:${ins.bestMoveSan}`;
    const derived = deriveFenBefore(
      entry.moveHistory,
      ins.moveNumber,
      ins.color
    );
    if (!derived) {
      dropped.push({
        id: row.id,
        header,
        reason: "derivation_failed (ply overruns history / illegal replay)",
      });
      console.warn(
        `DROP ${row.id} [INSIGHT:${header}] — could not derive fenBefore`
      );
      continue;
    }
    if (!isLegalSan(derived.fenBefore, ins.movePlayedSan)) {
      dropped.push({
        id: row.id,
        header,
        reason: `illegal: ${ins.movePlayedSan} not playable from derived fenBefore`,
      });
      console.warn(
        `DROP ${row.id} [INSIGHT:${header}] — ${ins.movePlayedSan} illegal from derived fenBefore (coach mislabeled move number)`
      );
      continue;
    }
    const moveLabel =
      ins.color === "b"
        ? `${ins.moveNumber}...${ins.movePlayedSan}`
        : `${ins.moveNumber}. ${ins.movePlayedSan}`;
    items.push({
      type: "insight",
      id: `${row.id}#${ins.moveNumber}${ins.color}`,
      fen: derived.fenBefore,
      moveLabel,
      movePlayedSan: ins.movePlayedSan,
      bestMoveSan: ins.bestMoveSan,
      classification: ins.classification,
      evalBefore: ins.evalBefore,
      evalAfter: ins.evalAfter,
      description: ins.description,
      whyText: ins.why,
      userRating: entry.userRating,
      tier: entry.tier,
    });
    insightCount += 1;
  }
}

writeFileSync(out, JSON.stringify({ items }, null, 2));
console.log(
  `wrote ${items.length} items -> ${out} ` +
    `(${insightCount} insight, ${fullGameCount} full-game), ` +
    `dropped ${dropped.length} illegal/overrun insight(s), ` +
    `skipped ${orphanIds.length} orphan row(s)`
);
if (orphanIds.length) {
  console.log(`  orphans (no eval-set entry): ${orphanIds.join(", ")}`);
}

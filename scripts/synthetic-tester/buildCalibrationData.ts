#!/usr/bin/env node
/**
 * Transform a helpfulness baseline run (coachText + grounding + auto-scores)
 * into the /calibrate page's data file — joining rating tier from the frozen
 * eval set and STRIPPING auto-scores (raters must not be anchored). The
 * auto-scores stay in the run JSON for recalibration after rating.
 *
 *   npx tsx scripts/synthetic-tester/buildCalibrationData.ts --run scripts/synthetic-tester/runs/helpbaseline-XXXX.json
 */
import { readFileSync, writeFileSync } from "fs";

interface RunRow {
  id: string;
  ok: boolean;
  coachText?: string;
  grounding?: {
    fen: string;
    movePlayedSan: string;
    bestMoveSan: string;
    evalDeltaCpMoverPov: number;
    classification: string;
  };
}
interface EvalEntry {
  id: string;
  userRating: number;
  tier: string;
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
const evalPath = arg("eval-set") || "scripts/synthetic-tester/fixtures/helpfulness/eval-set-50.json";
const out = arg("out") || "public/calibration-data.json";

const run = JSON.parse(readFileSync(runPath, "utf8")) as { rows: RunRow[] };
const ev = JSON.parse(readFileSync(evalPath, "utf8")) as { entries: EvalEntry[] };
const byId = new Map<string, EvalEntry>(ev.entries.map((e) => [e.id, e]));

const items = run.rows
  .filter((r): r is RunRow & { coachText: string; grounding: NonNullable<RunRow["grounding"]> } =>
    Boolean(r.ok && r.coachText && r.grounding),
  )
  .map((r) => {
    const e = byId.get(r.id);
    return {
      id: r.id,
      fen: r.grounding.fen,
      movePlayedSan: r.grounding.movePlayedSan,
      bestMoveSan: r.grounding.bestMoveSan,
      evalDeltaCpMoverPov: r.grounding.evalDeltaCpMoverPov,
      classification: r.grounding.classification,
      userRating: e?.userRating ?? 1500,
      tier: e?.tier ?? "intermediate",
      coachText: r.coachText,
    };
  });

writeFileSync(out, JSON.stringify({ items }, null, 2));
console.log(`wrote ${items.length} items -> ${out} (auto-scores stripped)`);

#!/usr/bin/env node
/**
 * Export a human-rating worksheet from a helpfulness baseline run (Phase 1
 * calibration harness). Raters fill 0/1/2 per dimension; the jury's auto-scores
 * are DELIBERATELY withheld from the sheet to avoid anchoring bias. The filled
 * sheets + the run's auto-scores feed fitDimensionRecalibration (see
 * CALIBRATION.md).
 *
 *   npx tsx scripts/synthetic-tester/exportCalibrationSheet.ts --run scripts/synthetic-tester/runs/helpbaseline-XXXX.json --rater A
 */
import { readFileSync, writeFileSync } from "fs";

interface Row {
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

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function main() {
  const argv = process.argv.slice(2);
  const get = (n: string) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const runPath = get("run");
  if (!runPath) {
    console.error("usage: --run <runJson> [--rater <id>] [--out <csv>]");
    process.exit(2);
  }
  const rater = get("rater") || "R1";
  const out = get("out") || runPath.replace(/\.json$/, "") + `.calib-${rater}.csv`;

  const data = JSON.parse(readFileSync(runPath, "utf8")) as { rows: Row[] };
  const rateable = data.rows.filter((r) => r.ok && r.coachText && r.grounding);

  const DIMS = [
    "d1_correctness",
    "d2_diagnostic",
    "d3_insight",
    "d4_actionability",
    "d5_level_fit",
    "d6_assist_calibration",
    "d7_focus",
  ];
  const header = ["id", "rater", "fen", "move_played", "best_move", "eval_delta_cp", "classification", "coach_text", ...DIMS];
  const lines = [header.join(",")];
  for (const r of rateable) {
    const g = r.grounding!;
    lines.push(
      [
        csvCell(r.id),
        csvCell(rater),
        csvCell(g.fen),
        csvCell(g.movePlayedSan),
        csvCell(g.bestMoveSan),
        csvCell(g.evalDeltaCpMoverPov),
        csvCell(g.classification),
        csvCell(r.coachText!),
        ...DIMS.map(() => ""), // blank — rater fills 0/1/2
      ].join(","),
    );
  }
  writeFileSync(out, lines.join("\n"));
  console.log(`wrote ${rateable.length} rows -> ${out}`);
  console.log(`Give this to rater "${rater}" (>=1600). They fill d1..d7 with 0/1/2 per CALIBRATION.md.`);
}

main();

/**
 * Live probe of the rating-history chain: fetch → parse → downsample → trend.
 * Run: npx tsx scripts/history-probe.ts
 */
import {
  fetchLichessHistory,
  fetchChessComHistory,
  ARCHIVE_MONTH_CAP,
} from "../src/lib/rating/fetchRatingHistory";
import { CHARTED_PERFS, buildTrend, downsampleDaily } from "../src/lib/rating/ratingHistory";

const DAY = 24 * 60 * 60 * 1000;

async function report(label: string, series: Awaited<ReturnType<typeof fetchLichessHistory>>) {
  if (!series) {
    console.log(`${label.padEnd(26)} → UNAVAILABLE`);
    return;
  }
  for (const days of [90, 365]) {
    const since = Date.now() - days * DAY;
    const line = CHARTED_PERFS.map((p) => {
      const t = buildTrend(p, downsampleDaily(series[p], since), "lichess");
      const d = t.delta === undefined ? "—" : (t.delta > 0 ? "+" : "") + t.delta;
      return `${p}: ${String(t.current ?? "—").padStart(4)} (${t.points.length}pts, Δ${d})`;
    }).join("  ");
    console.log(`${label.padEnd(26)} ${String(days).padStart(3)}d → ${line}`);
  }
}

async function main() {
  console.log(`(chess.com archive cap = ${ARCHIVE_MONTH_CAP} months)\n`);
  await report("lichess DrNykterstein", await fetchLichessHistory("DrNykterstein"));
  await report("lichess bad-username!!", await fetchLichessHistory("bad username!!"));
  await report("chesscom erik", await fetchChessComHistory("erik"));
}

void main();

/**
 * Live end-to-end probe of the rating-lookup chain: fetch → parse → normalize
 * → select. Single diagnostic requests against public endpoints; not a load test.
 *
 * Run: npx tsx scripts/rating-probe.ts
 */
import {
  fetchLichessRatings,
  fetchChessComRatings,
} from "../src/lib/rating/fetchPlatformRatings";
import { selectCalibrationRating, type PlatformRatings } from "../src/lib/rating/platformRatings";

const CASES: { label: string; lichess?: string; chesscom?: string }[] = [
  { label: "super-GM, lichess only", lichess: "DrNykterstein" },
  { label: "club player, chess.com only", chesscom: "erik" },
  { label: "both platforms linked", lichess: "penguingm1", chesscom: "hikaru" },
  { label: "username that does not exist", lichess: "zzz-not-a-real-user-zzz-42" },
  { label: "injection attempt in username", lichess: "../../admin?x=1" },
];

async function main() {
for (const c of CASES) {
  const sources: PlatformRatings[] = [];
  const notes: string[] = [];

  if (c.lichess) {
    const r = await fetchLichessRatings(c.lichess);
    if (r.status === "ok") sources.push(r.ratings);
    else notes.push(`lichess:${r.status}${r.status === "unavailable" ? `(${r.reason})` : ""}`);
  }
  if (c.chesscom) {
    const r = await fetchChessComRatings(c.chesscom);
    if (r.status === "ok") sources.push(r.ratings);
    else notes.push(`chesscom:${r.status}${r.status === "unavailable" ? `(${r.reason})` : ""}`);
  }

  const sel = selectCalibrationRating(sources);
  const perfSummary = sources
    .map((s) => `${s.platform}[${s.perfs.map((p) => `${p.perf} ${p.rating}`).join(", ") || "none"}]`)
    .join(" ");

  console.log(
    `${c.label.padEnd(30)} → ${
      sel
        ? `calibrate ${String(sel.rating).padStart(4)} (raw ${sel.rawRating} ${sel.platform} ${sel.perf})`
        : "NO RATING (correct: absence, not a default)"
    }  ${perfSummary} ${notes.length ? `!${notes.join(",")}` : ""}`
  );
}
}

void main();

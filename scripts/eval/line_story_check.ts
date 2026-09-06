/**
 * Line-story correctness check — $0, no network.
 *
 * The story (src/lib/contract/lineStory.ts) narrates what each ply of a line
 * does. Lichess puzzle solutions are labeled lines: `mateInN` says exactly
 * where the story must end in checkmate; a theme label says which motif the
 * solver's plies must create; `sacrifice` puzzles are where a first move
 * SHOULD read as an offer, and non-sacrifice puzzles are where it should not.
 *
 * Usage: npx tsx scripts/eval/line_story_check.ts [--n 400] [--output p.json]
 */
import * as fs from "node:fs";
import { Chess } from "chess.js";
import { buildLineStory } from "@/lib/contract/lineStory";

const argv = process.argv.slice(2);
const N = (() => { const i = argv.indexOf("--n"); return i >= 0 ? Number(argv[i + 1]) : 400; })();
const OUT = (() => { const i = argv.indexOf("--output"); return i >= 0 ? argv[i + 1] : null; })();

interface Puzzle { id: string; fen: string; moves: string[]; themes: Set<string> }
const rows = fs.readFileSync("public/data/lichess_puzzles_100k.csv", "utf8").split("\n").slice(1).filter(Boolean);
const puzzles: Puzzle[] = rows.map((l) => { const p = l.split(","); return { id: p[0], fen: p[1], moves: p[2].split(" "), themes: new Set(p[7].split(" ")) }; });
function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
const pick = (pred: (p: Puzzle) => boolean, n = N) => puzzles.filter(pred).sort((a, b) => hash(a.id) - hash(b.id)).slice(0, n);
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

/** The solver's line: position after the setup move, solution plies as SAN. */
function solverLine(p: Puzzle): { fen: string; san: string[] } | null {
  const g = new Chess(p.fen);
  try { g.move({ from: p.moves[0].slice(0, 2), to: p.moves[0].slice(2, 4), promotion: p.moves[0][4] }); } catch { return null; }
  const fen = g.fen(); const san: string[] = [];
  for (const u of p.moves.slice(1)) { try { san.push(g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { return null; } }
  return { fen, san };
}

const report: Record<string, unknown> = { n: N };

// 1. mateInN: the story must end in checkmate exactly at ply 2N-1 of the solver's line
for (const n of [1, 2, 3]) {
  const set = pick((p) => p.themes.has(`mateIn${n}`)); let ok = 0, total = 0, wrongPly = 0, noMate = 0;
  for (const p of set) {
    const line = solverLine(p); if (!line) continue; total++;
    const s = buildLineStory(line.fen, line.san, { maxPlies: 12 });
    if (!s.endsInMate) { noMate++; continue; }
    if (s.plies.length === 2 * n - 1) ok++; else wrongPly++;
  }
  console.log(`mateIn${n.toString().padEnd(11)} n=${total}  mate at the right ply=${pct(ok, total)}  wrong ply=${wrongPly}  no mate=${noMate}`);
  report[`mateIn${n}`] = { total, ok, wrongPly, noMate };
}

// 2. Theme motifs appear in the solver plies' stories
const THEME_TO_MOTIF: Record<string, string> = { fork: "fork", pin: "pin", skewer: "skewer", discoveredAttack: "discovered_attack", trappedPiece: "trapped_piece" };
for (const [theme, motif] of Object.entries(THEME_TO_MOTIF)) {
  const set = pick((p) => p.themes.has(theme)); let hit = 0, total = 0;
  for (const p of set) {
    const line = solverLine(p); if (!line) continue; total++;
    const s = buildLineStory(line.fen, line.san, { maxPlies: 12 });
    const owner = s.owner;
    // A discovered attack on the KING is narrated as a discovered/double check rather than a motif.
    const named = (pl: (typeof s.plies)[number]) =>
      pl.facts.some((f) => (f.kind === "motif" && f.motif.motif === motif) || (motif === "discovered_attack" && (f.kind === "discovered_check" || f.kind === "double_check")));
    if (s.plies.some((pl) => pl.mover === owner && named(pl))) hit++;
  }
  console.log(`${theme.padEnd(17)} n=${total}  story names the motif on a solver ply=${pct(hit, total)}`);
  report[theme] = { total, hit };
}

// 3. Sacrifice honesty: first solver move leaves the moved piece en prise
{
  const sac = pick((p) => p.themes.has("sacrifice")), non = pick((p) => !p.themes.has("sacrifice") && !p.themes.has("mate"));
  const score = (set: Puzzle[]) => { let enPrise = 0, unresolved = 0, total = 0; for (const p of set) { const line = solverLine(p); if (!line) continue; total++; const s = buildLineStory(line.fen, line.san, { maxPlies: 12 }); if (s.plies[0]?.facts.some((f) => f.kind === "en_prise" && f.movedPiece)) enPrise++; if (s.unresolvedSacrifice) unresolved++; } return { total, enPrise, unresolved }; };
  const a = score(sac), b = score(non);
  console.log(`sacrifice         n=${a.total}  first move offers the piece=${pct(a.enPrise, a.total)}  flagged unresolved=${pct(a.unresolved, a.total)}`);
  console.log(`non-sacrifice     n=${b.total}  first move offers the piece=${pct(b.enPrise, b.total)}  flagged unresolved=${pct(b.unresolved, b.total)}`);
  report.sacrifice = a; report.nonSacrifice = b;
}

// 4. Material ledger sign on decisive puzzles: the solver should not end the shown line DOWN material unless it mates
{
  const set = pick((p) => p.themes.has("crushing") && !p.themes.has("mate") && !p.themes.has("sacrifice")); let up = 0, level = 0, down = 0, total = 0;
  for (const p of set) { const line = solverLine(p); if (!line) continue; total++; const s = buildLineStory(line.fen, line.san, { maxPlies: 12 }); if (s.endsInMate || s.netMaterialCp > 0) up++; else if (s.netMaterialCp === 0) level++; else down++; }
  console.log(`crushing (no mate/sac) n=${total}  solver up material or mates=${pct(up, total)}  level=${pct(level, total)}  down=${pct(down, total)}`);
  report.crushingLedger = { total, up, level, down };
}

// 5. Quiet share: how many solver plies have no facts at all (the model is told to call these quiet)
//    — and how often each positional purpose speaks (a sanity check on their rates, not a truth test)
{
  let plies = 0, quiet = 0, avgFacts = 0; const purposeCounts: Record<string, number> = {};
  const PURPOSES = ["attacks_pinned", "to_open_file", "doubles", "outpost", "blockades", "attacks_weak_pawn", "pawn_challenges", "passed_pawn", "develops", "centralizes", "king_activity"];
  for (const p of pick(() => true, 1000)) { const line = solverLine(p); if (!line) continue; const s = buildLineStory(line.fen, line.san, { maxPlies: 12 }); for (const pl of s.plies) { plies++; if (pl.facts.length === 0) quiet++; avgFacts += pl.facts.length; for (const f of pl.facts) if (PURPOSES.includes(f.kind)) purposeCounts[f.kind] = (purposeCounts[f.kind] ?? 0) + 1; } }
  console.log(`all solutions     plies=${plies}  quiet plies=${pct(quiet, plies)}  facts/ply=${(avgFacts / Math.max(1, plies)).toFixed(2)}`);
  console.log(`purpose facts per 100 plies: ${PURPOSES.map((k) => `${k}=${((100 * (purposeCounts[k] ?? 0)) / Math.max(1, plies)).toFixed(1)}`).join("  ")}`);
  report.density = { plies, quiet, avgFacts: avgFacts / Math.max(1, plies), purposeCounts };
}
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(report, null, 2)); console.log(`wrote ${OUT}`); }

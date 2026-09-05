/**
 * Motif-detector recall benchmark — $0, no network.
 *
 * WHY: the ChessQA "motifs" battery shows the flagship LLM identifies static
 * forks/pins/batteries at 48% with or without engine context (0.0pp lift,
 * chessqa-motifs-grounding-sonnet46.json). Motif detection is therefore the
 * job of src/lib/tactics, not the model — but the detectors' recall has never
 * been measured against labeled data. The referee arming notes admit that
 * "~11 of 15" tactical-keyword fires were real board tactics outside the
 * detector's scope: every miss is BOTH a lesson the coach cannot teach AND a
 * true sentence the referee cuts.
 *
 * Two labeled sources, both vendored:
 *  A. Lichess puzzles (public/data/lichess_puzzles_100k.csv, `Themes`).
 *     For each theme, sample N puzzles; replay the opponent's setup move;
 *     run detectMotifs(fenBefore, solverMove) on every solver move in the
 *     solution and record whether the themed motif appears (any / confirmed
 *     / on the first solver move). hangingPiece is scored from the solver's
 *     side of the position AFTER the setup move (that is where the coach
 *     needs it: "your move hung the knight"). An "unlabeled fire" rate on
 *     puzzles WITHOUT the theme is reported as a precision PROXY only —
 *     Lichess labels are incomplete, so it is an upper bound on false fires.
 *  B. ChessQA motifs (scripts/eval/fixtures/chessqa/motifs.jsonl): exhaustive
 *     geometric labels (every fork / pin / battery / skewer in a position).
 *     Scored with a static enumerator built on the same primitives
 *     (rawAttacks) the detectors use — exact precision/recall of the geometry.
 *
 * Usage: npx tsx scripts/eval/motif_detector_recall.ts [--n 400] [--output p.json]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess, type Square, type Color, type PieceSymbol } from "chess.js";
import { detectMotifs, type AnyMotif } from "../../src/lib/tactics";
import { detectHangingPieces } from "../../src/lib/tactics/motifs/hanging_piece";
import { rawAttacks } from "../../src/lib/tactics/utils";

const REPO = process.cwd();
const CSV = path.join(REPO, "public/data/lichess_puzzles_100k.csv");
const CHESSQA = path.join(REPO, "scripts/eval/fixtures/chessqa/motifs.jsonl");

const argv = process.argv.slice(2);
const N = (() => { const i = argv.indexOf("--n"); return i >= 0 ? Number(argv[i + 1]) : 400; })();
const OUT = (() => { const i = argv.indexOf("--output"); return i >= 0 ? argv[i + 1] : null; })();

// Lichess theme → our motif type (per-move detectors, solver side).
const THEME_TO_MOTIF: Record<string, AnyMotif["motif"]> = {
  fork: "fork",
  pin: "pin",
  skewer: "skewer",
  discoveredAttack: "discovered_attack",
  trappedPiece: "trapped_piece",
  backRankMate: "back_rank_mate",
};

interface Puzzle { id: string; fen: string; moves: string[]; themes: Set<string>; rating: number }

function loadPuzzles(): Puzzle[] {
  const lines = fs.readFileSync(CSV, "utf8").split("\n");
  const out: Puzzle[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 8) continue;
    out.push({
      id: parts[0], fen: parts[1], moves: parts[2].split(" "),
      rating: Number(parts[3]), themes: new Set(parts[7].split(" ").filter(Boolean)),
    });
  }
  return out;
}

// Deterministic sample: hash the id so the sample is stable across runs.
function hash(s: string): number { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function sample<T extends { id: string }>(xs: T[], n: number): T[] {
  return [...xs].sort((a, b) => hash(a.id) - hash(b.id)).slice(0, n);
}

function uciToSan(g: Chess, uci: string): string | null {
  try {
    const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return m ? m.san : null;
  } catch { return null; }
}

/** Every solver move in the solution: [fenBefore, san]. moves[0] is the opponent's setup move. */
function solverPlies(p: Puzzle): Array<{ fenBefore: string; san: string; uci: string }> {
  const g = new Chess(p.fen);
  const out: Array<{ fenBefore: string; san: string; uci: string }> = [];
  for (let i = 0; i < p.moves.length; i++) {
    const fenBefore = g.fen();
    const san = uciToSan(g, p.moves[i]);
    if (!san) break;
    if (i % 2 === 1) out.push({ fenBefore, san, uci: p.moves[i] });
  }
  return out;
}

interface ThemeResult {
  theme: string; motif: string; n: number;
  anyHit: number; confirmedHit: number; firstMoveHit: number; firstMoveConfirmed: number;
  unlabeledN: number; unlabeledAnyFire: number; unlabeledConfirmedFire: number;
  misses: Array<{ id: string; fen: string; moves: string; detected: string[] }>;
}

function scoreTheme(theme: string, motif: AnyMotif["motif"], pos: Puzzle[], neg: Puzzle[]): ThemeResult {
  const r: ThemeResult = { theme, motif, n: 0, anyHit: 0, confirmedHit: 0, firstMoveHit: 0, firstMoveConfirmed: 0,
    unlabeledN: 0, unlabeledAnyFire: 0, unlabeledConfirmedFire: 0, misses: [] };
  const matches = (m: AnyMotif) => motif === "back_rank_mate" ? (m.motif === "back_rank_mate" || m.motif === "back_rank_threat") : m.motif === motif;
  for (const p of pos) {
    const plies = solverPlies(p);
    if (plies.length === 0) continue;
    r.n++;
    let any = false, conf = false; const seen = new Set<string>();
    plies.forEach((pl, idx) => {
      const ms = detectMotifs(pl.fenBefore, pl.san);
      for (const m of ms) seen.add(m.motif + (m.confirmed ? "✓" : "?"));
      const hit = ms.filter(matches);
      if (hit.length) { any = true; if (idx === 0) r.firstMoveHit++; }
      if (hit.some((m) => m.confirmed)) { conf = true; if (idx === 0) r.firstMoveConfirmed++; }
    });
    if (any) r.anyHit++;
    if (conf) r.confirmedHit++;
    if (!any && r.misses.length < 25) r.misses.push({ id: p.id, fen: p.fen, moves: p.moves.join(" "), detected: Array.from(seen) });
  }
  for (const p of neg) {
    const plies = solverPlies(p);
    if (plies.length === 0) continue;
    r.unlabeledN++;
    let any = false, conf = false;
    for (const pl of plies) {
      const hit = detectMotifs(pl.fenBefore, pl.san).filter(matches);
      if (hit.length) any = true;
      if (hit.some((m) => m.confirmed)) conf = true;
    }
    if (any) r.unlabeledAnyFire++;
    if (conf) r.unlabeledConfirmedFire++;
  }
  return r;
}

/** hangingPiece: after the setup move, does the static scan (solver side) list the square the solver captures first? */
function scoreHanging(pos: Puzzle[], neg: Puzzle[]) {
  const r = { theme: "hangingPiece", motif: "hanging_piece (static, solver side)", n: 0, anyHit: 0, capturedSquareHit: 0,
    unlabeledN: 0, unlabeledAnyFire: 0, misses: [] as Array<{ id: string; fen: string; moves: string }> };
  const scan = (p: Puzzle) => {
    const g = new Chess(p.fen);
    if (!uciToSan(g, p.moves[0])) return null;
    const solver: Color = g.turn();
    const hanging = detectHangingPieces(g, solver);
    return { hanging, firstTarget: p.moves[1]?.slice(2, 4) as Square | undefined };
  };
  for (const p of pos) {
    const s = scan(p); if (!s) continue; r.n++;
    if (s.hanging.length) r.anyHit++;
    if (s.firstTarget && s.hanging.some((h) => h.square === s.firstTarget)) r.capturedSquareHit++;
    else if (r.misses.length < 25) r.misses.push({ id: p.id, fen: p.fen, moves: p.moves.join(" ") });
  }
  for (const p of neg) { const s = scan(p); if (!s) continue; r.unlabeledN++; if (s.hanging.length) r.unlabeledAnyFire++; }
  return r;
}

// ── B. ChessQA static geometry (their definitions, our primitives) ─────────
interface QaItem { task_id: string; task_type: string; input: string; correct_answer: string; answer_type: string }

function enemyUnitsAttacked(g: Chess, from: Square): Square[] {
  const p = g.get(from)!;
  return rawAttacks(g, from).filter((sq) => { const t = g.get(sq); return !!t && t.color !== p.color; });
}
function qaForks(fen: string): string[] {
  const g = new Chess(fen); const out: string[] = [];
  for (const row of g.board()) for (const sq of row) {
    if (!sq) continue;
    const tg = enemyUnitsAttacked(g, sq.square as Square);
    if (tg.length >= 2) out.push(`${sq.square}>${[...tg].sort().join("-")}`);
  }
  return out.sort();
}
const DIRS: Record<string, [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]], r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  q: [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]],
};
const sq2 = (s: Square): [number, number] => [s.charCodeAt(0) - 97, Number(s[1]) - 1];
const c2sq = (x: number, y: number): Square | null => x < 0 || x > 7 || y < 0 || y > 7 ? null : (`${String.fromCharCode(97 + x)}${y + 1}` as Square);
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
/** Rays from every slider: returns [slider, first, second] triples with colors. */
function rays(g: Chess) {
  const out: Array<{ from: Square; p: PieceSymbol; c: Color; first: { sq: Square; p: PieceSymbol; c: Color } | null; second: { sq: Square; p: PieceSymbol; c: Color } | null }> = [];
  for (const row of g.board()) for (const s of row) {
    if (!s || !DIRS[s.type]) continue;
    const [x0, y0] = sq2(s.square as Square);
    for (const [dx, dy] of DIRS[s.type]) {
      let x = x0 + dx, y = y0 + dy; let first = null as any, second = null as any;
      for (;;) {
        const sq = c2sq(x, y); if (!sq) break;
        const t = g.get(sq);
        if (t) { if (!first) first = { sq, p: t.type, c: t.color }; else { second = { sq, p: t.type, c: t.color }; break; } }
        x += dx; y += dy;
      }
      out.push({ from: s.square as Square, p: s.type, c: s.color, first, second });
    }
  }
  return out;
}
function qaPins(fen: string, kingOnly: boolean): string[] {
  const g = new Chess(fen); const out: string[] = [];
  for (const r of rays(g)) {
    if (!r.first || !r.second) continue;
    if (r.first.c === r.c || r.second.c === r.c) continue;
    const behindOk = kingOnly ? r.second.p === "k" : (r.second.p === "k" || VAL[r.second.p] > VAL[r.first.p]);
    if (behindOk) out.push(`${r.from}>${r.first.sq}>${r.second.sq}`);
  }
  return out.sort();
}
function qaSkewers(fen: string): string[] {
  const g = new Chess(fen); const out: string[] = [];
  for (const r of rays(g)) {
    if (!r.first || !r.second) continue;
    if (r.first.c === r.c || r.second.c === r.c) continue;
    if (VAL[r.first.p] > VAL[r.second.p]) out.push(`${r.from}>${r.first.sq}>${r.second.sq}`);
  }
  return out.sort();
}
function qaBatteries(fen: string): string[] {
  const g = new Chess(fen); const groups: string[][] = [];
  // Walk each ray from each slider; collect maximal chains of same-color sliders that can move along that ray direction.
  const canSlide = (p: PieceSymbol, dx: number, dy: number) => p === "q" || (p === "r" && (dx === 0 || dy === 0)) || (p === "b" && dx !== 0 && dy !== 0);
  const seen = new Set<string>();
  for (const row of g.board()) for (const s of row) {
    if (!s || !DIRS[s.type]) continue;
    for (const [dx, dy] of DIRS.q) {
      if (!canSlide(s.type, dx, dy)) continue;
      // only start chains from the "lowest" end: skip if the previous square along -dir holds a same-color slider that can slide this way
      let px = sq2(s.square as Square)[0] - dx, py = sq2(s.square as Square)[1] - dy, blockedBehind = false;
      for (;;) { const sq = c2sq(px, py); if (!sq) break; const t = g.get(sq); if (t) { if (t.color === s.color && DIRS[t.type] && canSlide(t.type, dx, dy)) blockedBehind = true; break; } px -= dx; py -= dy; }
      if (blockedBehind) continue;
      const chain: Square[] = [s.square as Square];
      let x = sq2(s.square as Square)[0] + dx, y = sq2(s.square as Square)[1] + dy;
      for (;;) { const sq = c2sq(x, y); if (!sq) break; const t = g.get(sq); if (t) { if (t.color === s.color && DIRS[t.type] && canSlide(t.type, dx, dy)) { chain.push(sq); } else break; } x += dx; y += dy; }
      // ChessQA orders battery squares by rank, then file ("e2>d3", "b4>a5").
      const byRankThenFile = (a: Square, b: Square) => a[1] === b[1] ? a.localeCompare(b) : a[1].localeCompare(b[1]);
      if (chain.length >= 2) { const sorted = [...chain].sort(byRankThenFile); const key = sorted.join(">"); if (!seen.has(key)) { seen.add(key); groups.push(sorted); } }
    }
  }
  return groups.map((c) => c.join(">")).sort();
}
function scoreChessQa() {
  const items: QaItem[] = fs.readFileSync(CHESSQA, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const byType: Record<string, { n: number; exact: number; tp: number; fp: number; fn: number; wrong: Array<{ id: string; fen: string; gold: string; ours: string }> }> = {};
  const variants: Record<string, (fen: string) => string[]> = {
    motifs_fork: qaForks, motifs_pin: (f) => qaPins(f, true), motifs_skewer: qaSkewers, motifs_battery: qaBatteries,
  };
  const pinRelative = { n: 0, exact: 0 };
  for (const it of items) {
    const fn = variants[it.task_type]; if (!fn) continue;
    const b = (byType[it.task_type] ??= { n: 0, exact: 0, tp: 0, fp: 0, fn: 0, wrong: [] });
    const gold = new Set(it.correct_answer.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s && s !== "none"));
    const ours = new Set(fn(it.input).map((s) => s.toLowerCase()));
    b.n++;
    const exact = gold.size === ours.size && Array.from(gold).every((g) => ours.has(g));
    if (exact) b.exact++; else if (b.wrong.length < 10) b.wrong.push({ id: it.task_id, fen: it.input, gold: Array.from(gold).join(", "), ours: Array.from(ours).join(", ") });
    gold.forEach((g) => { if (ours.has(g)) b.tp++; else b.fn++; });
    ours.forEach((o) => { if (!gold.has(o)) b.fp++; });
    if (it.task_type === "motifs_pin") {
      pinRelative.n++;
      const o2 = new Set(qaPins(it.input, false).map((s) => s.toLowerCase()));
      if (gold.size === o2.size && Array.from(gold).every((g) => o2.has(g))) pinRelative.exact++;
    }
  }
  return { byType, pinRelativeVariant: pinRelative };
}

// ── main ───────────────────────────────────────────────────────────────────
const puzzles = loadPuzzles();
console.log(`loaded ${puzzles.length} puzzles; N=${N} per theme`);
const results: ThemeResult[] = [];
const t0 = Date.now();
for (const [theme, motif] of Object.entries(THEME_TO_MOTIF)) {
  const pos = sample(puzzles.filter((p) => p.themes.has(theme)), N);
  const neg = sample(puzzles.filter((p) => !p.themes.has(theme)), N);
  const r = scoreTheme(theme, motif, pos, neg);
  results.push(r);
  console.log(
    `${theme.padEnd(16)} n=${r.n}  any=${pct(r.anyHit, r.n)}  confirmed=${pct(r.confirmedHit, r.n)}  firstMove=${pct(r.firstMoveHit, r.n)}  ` +
    `| unlabeled fire any=${pct(r.unlabeledAnyFire, r.unlabeledN)} confirmed=${pct(r.unlabeledConfirmedFire, r.unlabeledN)}`,
  );
}
const hanging = scoreHanging(sample(puzzles.filter((p) => p.themes.has("hangingPiece")), N), sample(puzzles.filter((p) => !p.themes.has("hangingPiece")), N));
console.log(`${"hangingPiece".padEnd(16)} n=${hanging.n}  anyHanging=${pct(hanging.anyHit, hanging.n)}  capturedSquareFlagged=${pct(hanging.capturedSquareHit, hanging.n)}  | unlabeled fire any=${pct(hanging.unlabeledAnyFire, hanging.unlabeledN)}`);
console.log(`lichess pass: ${Date.now() - t0}ms`);

const qa = scoreChessQa();
console.log("\nChessQA motifs (exhaustive geometric labels; LLM scored 48% exact-match here):");
for (const [t, b] of Object.entries(qa.byType)) {
  const prec = b.tp / Math.max(1, b.tp + b.fp), rec = b.tp / Math.max(1, b.tp + b.fn);
  console.log(`${t.padEnd(16)} n=${b.n}  exact=${pct(b.exact, b.n)}  item-precision=${(100 * prec).toFixed(1)}%  item-recall=${(100 * rec).toFixed(1)}%`);
}
console.log(`motifs_pin (relative-pin variant) exact=${pct(qa.pinRelativeVariant.exact, qa.pinRelativeVariant.n)}`);

function pct(a: number, b: number) { return b ? `${((100 * a) / b).toFixed(1)}%` : "n/a"; }

if (OUT) {
  fs.writeFileSync(OUT, JSON.stringify({ n: N, csv: path.relative(REPO, CSV), lichess: results, hangingPiece: hanging, chessqa: qa }, null, 2));
  console.log(`wrote ${OUT}`);
}

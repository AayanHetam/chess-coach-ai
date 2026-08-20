// Build engine-backed IntentProbe inputs for the founder's games, at depth 16.
//
// ── WHY THIS REPLACES probe16.mjs ──────────────────────────────────────────
//
// The founder looked at game_11 move 40 and asked why the same move, in the
// same position, scored 2706 in one field and 4837 in another. It cannot. That
// question found a real bug, and chasing it found three more:
//
//   1. NULL-MOVE POSITIONS POISONED THE TABLE. A null move is one side moving
//      twice — not reachable by legal play. Searching a long sequence of them
//      in the same engine as the real positions corrupted the real ones:
//      game_11 ply 86 read MATE IN 17 where the truth was ~600cp.
//
//   2. SPLITTING THE ENGINES WAS NOT ENOUGH. probe16 sent null-move searches to
//      a cleared engine but left `threatAfter` on the WARM one — so the
//      prophylaxis swing subtracted a cold measurement from a warm one. On 50
//      positions the two regimes disagree by a median of 15cp but a p90 of
//      166cp, which is larger than the 150cp threshold the difference feeds.
//
//   3. THE SWEEP DID NOT MATCH PRODUCTION. It ran 6 threads; the client never
//      sends `setoption name Threads`, so production is single-threaded and
//      deterministic. It also interleaved `searchmoves` probes and MultiPV
//      switches into the game walk, which production never does.
//
// ── THE RULE ───────────────────────────────────────────────────────────────
//
// ONE REGIME PER TIER, and no arithmetic across tiers.
//
//   ENGINE A — the gameEval mirror. Reproduces `uciEngine.evaluateGame`
//     exactly: `ucinewgame` ONCE per game, MultiPV 3, then every position of
//     the game in order with a bare `go depth 16` and nothing else. Its warm
//     transposition table is not a bug — it is what production has, so the
//     numbers the module sees in production are these numbers.
//
//   ENGINE B — the Tier 1 prober. `ucinewgame` before EVERY search, because
//     its positions (null moves, hypothetical alternatives) have no legitimate
//     relationship to one another. It measures BOTH operands of every
//     subtraction it feeds, including its own copy of the opponent's best
//     reply, so no comparison ever straddles the two engines.
//
// Stores RAW ENGINE DATA ONLY. `position` and `tempting` are filled at apply
// time by the real buildPositionFacts / isTemptingReply, so this harness cannot
// drift from the code it is meant to be testing.
//
// Resumable: re-running picks up from the checkpoint.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Chess } from "chess.js";

// GAMES_JSON: a coach_runs-style JSON with the games to probe (see games()
// below for the expected shape). OUT: where the probe corpus accumulates
// (resumable). Both are local artifacts — game data never enters the repo.
const GAMES_JSON = process.env.GAMES_JSON || process.argv[2];
const OUT = process.env.OUT || process.argv[3] || "probes.json";
if (!GAMES_JSON) {
  console.error("usage: node scripts/intent/probe-corpus.mjs <games.json> [out.json]");
  process.exit(1);
}
const DEPTH = Number(process.env.DEPTH || 16);
const MULTIPV = 3; // uciEngine.ts:55 — the client's default, and every caller passes 3
const ONLY = process.env.ONLY ? process.env.ONLY.split(",").map((s) => s.trim()) : null;
/**
 * A PRIVATELY-NAMED copy of the engine binary. Other work on this machine
 * cleans up with `pkill stockfish`, which took down all four shards of an
 * earlier run mid-sweep.
 */
const ENGINE = process.env.ENGINE || "/tmp/sf_probe_worker";

/**
 * THREADS IS DELIBERATELY NEVER SET.
 *
 * Grep of src/ finds no `setoption name Threads` on the client path, so
 * production runs at Stockfish's default of 1. Single-threaded search is also
 * deterministic — verified by running the same position three times and getting
 * byte-identical scores — which makes every number here reproducible. probe16
 * set 6 threads and then attributed the resulting variance to "multithreaded
 * nondeterminism", which was true but self-inflicted.
 */

/* ---------------- engine ---------------- */
let shuttingDown = false;
let respawns = 0;
let searches = 0;
let depthShortfalls = 0;

function makeEngine(label, { clearBeforeEverySearch }) {
  const E = {
    label, clearBeforeEverySearch, child: null, buf: "",
    pending: null, rejectPending: null, lines: new Map(), reachedDepth: 0, multipv: null,
  };
  E.child = spawnFor(E);
  return E;
}

function spawnFor(E) {
  E.buf = "";
  E.lines = new Map();
  E.multipv = null; // a new process has forgotten any setoption we sent
  const child = spawn(ENGINE);
  child.stderr.on("data", () => {}); // an unconsumed stderr pipe can block the engine

  child.stdout.on("data", (d) => {
    E.buf += d.toString();
    const parts = E.buf.split("\n");
    E.buf = parts.pop();
    for (const raw of parts) {
      const l = raw.trim();
      if (l.startsWith("info ") && l.includes(" pv ")) {
        const dm = /\bdepth (\d+)/.exec(l);
        if (dm) E.reachedDepth = Math.max(E.reachedDepth, Number(dm[1]));
        const sc = /score (cp|mate) (-?\d+)/.exec(l);
        const pv = / pv (.+)$/.exec(l);
        if (!dm || !sc || !pv || Number(dm[1]) !== DEPTH) continue;
        const m = /multipv (\d+)/.exec(l);
        E.lines.set(m ? Number(m[1]) : 1, {
          cp: sc[1] === "cp" ? Number(sc[2]) : null,
          mate: sc[1] === "mate" ? Number(sc[2]) : null,
          pv: pv[1].split(" "),
        });
      } else if (l.startsWith("bestmove")) {
        const res = E.pending;
        E.pending = null; E.rejectPending = null;
        if (res) {
          if (E.reachedDepth < DEPTH) depthShortfalls++;
          res([...E.lines.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]));
        }
      }
    }
  });

  child.on("exit", () => {
    if (shuttingDown) return;
    const rej = E.rejectPending;
    E.pending = null; E.rejectPending = null;
    if (rej) rej(new Error(`${E.label} engine died mid-search`));
  });

  child.stdin.on("error", () => {});
  child.stdin.write("uci\nisready\nucinewgame\nisready\n");
  return child;
}

function go(E, fen, { multipv = 1, searchmoves = null } = {}) {
  searches++;
  E.reachedDepth = 0;
  E.lines = new Map();
  return new Promise((res, rej) => {
    E.pending = res;
    E.rejectPending = rej;
    try {
      if (E.clearBeforeEverySearch) E.child.stdin.write("ucinewgame\nisready\n");
      // Only re-send MultiPV when it actually changes. Engine A must look to
      // the engine exactly like production, which sets it once and never again.
      if (E.multipv !== multipv) {
        E.child.stdin.write(`setoption name MultiPV value ${multipv}\n`);
        E.multipv = multipv;
      }
      E.child.stdin.write(`position fen ${fen}\ngo depth ${DEPTH}${searchmoves ? " searchmoves " + searchmoves : ""}\n`);
    } catch (e) { rej(e); }
  });
}

const real = makeEngine("A/gameEval", { clearBeforeEverySearch: false });
const prober = makeEngine("B/tier1", { clearBeforeEverySearch: true });

async function restartEngines() {
  respawns++;
  for (const E of [real, prober]) {
    try { E.child.kill("SIGKILL"); } catch { /* already gone */ }
    E.child = spawnFor(E);
  }
  await new Promise((r) => setTimeout(r, 400));
}

/* ---------------- chess helpers ---------------- */
function uciToSan(fen, uci) {
  try {
    const g = new Chess(fen);
    const mv = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return mv ? mv.san : null;
  } catch { return null; }
}
function pvToSan(fen, pv, max = 8) {
  const out = [];
  if (!pv) return out;
  try {
    const g = new Chess(fen);
    for (const u of pv.slice(0, max)) {
      const mv = g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.length > 4 ? u[4] : undefined });
      if (!mv) break;
      out.push(mv.san);
    }
  } catch { /* a partial pv is still worth showing */ }
  return out;
}
function sanToUci(fen, san) {
  try {
    const g = new Chess(fen);
    const mv = g.move(san);
    return mv ? mv.from + mv.to + (mv.promotion || "") : null;
  } catch { return null; }
}
function isLegalUci(fen, uci) {
  try {
    return new Chess(fen).moves({ verbose: true }).some(
      (m) => m.from === uci.slice(0, 2) && m.to === uci.slice(2, 4) && (uci.length > 4 ? m.promotion === uci[4] : true),
    );
  } catch { return false; }
}
function nullMoveFen(fen) {
  try {
    const g = new Chess(fen);
    if (g.isCheck()) return null;
    const p = fen.split(" ");
    p[1] = p[1] === "w" ? "b" : "w";
    p[3] = "-";
    const f = p.join(" ");
    if (new Chess(f).moves().length === 0) return null;
    return f;
  } catch { return null; }
}
const toScore = (l) => (l ? { cp: l.cp, mate: l.mate } : null);

/**
 * Flip a score to the other side's point of view.
 *
 * RAW UCI SCORES ARE SIDE-TO-MOVE RELATIVE, and the side to move changes every
 * ply — so reading `playedScore` off the evaluation of `fenAfter` gives the
 * OPPONENT's view of it, not ours. Production does the same conversion from a
 * different starting point (gameEval is white-relative, so fromGameEval.ts uses
 * `whiteRelativeToMover`); here the source is side-to-move relative, so the
 * conversion is a straight negation.
 *
 * Getting this wrong does not throw. It silently inverts every comparison for
 * one side, which is the failure this codebase already warns about.
 */
const flip = (s) => (s ? { cp: s.cp === null ? null : -s.cp, mate: s.mate === null ? null : -s.mate } : null);
function line(fen, l) {
  if (!l || !l.pv || l.pv.length === 0) return null;
  const san = uciToSan(fen, l.pv[0]);
  if (!san) return null;
  return { san, score: toScore(l), pv: pvToSan(fen, l.pv), depth: DEPTH };
}

/* ---------------- games ---------------- */
function games() {
  const runs = JSON.parse(readFileSync(GAMES_JSON, "utf8"));
  return runs
    .filter((g) => !ONLY || ONLY.some((o) => g.file.includes(o)))
    .map((g) => {
      const b = new Chess();
      const plies = [];
      let lastCap = null;
      for (const san of g.moves) {
        const fenBefore = b.fen();
        let mv;
        try { mv = b.move(san); } catch { break; }
        plies.push({
          ply: plies.length, fenBefore, san: mv.san, fenAfter: b.fen(),
          lastCaptureSquare: lastCap,
          byPlayer: g.playerColor ? (plies.length % 2 === 0 ? "w" : "b") === g.playerColor : null,
        });
        lastCap = mv.captured ? mv.to : null;
      }
      return { file: g.file, plies };
    });
}

const GAMES = games();
const TOTAL = GAMES.reduce((n, g) => n + g.plies.length, 0);
console.error(`games: ${GAMES.length}  plies: ${TOTAL}  depth: ${DEPTH}  threads: engine default (1)`);

/* ---------------- resume ---------------- */
let results = [];
if (existsSync(OUT)) {
  try {
    results = JSON.parse(readFileSync(OUT, "utf8"));
    console.error(`resuming from ${results.length} completed plies`);
  } catch { results = []; }
}
const done = new Set(results.map((r) => `${r.game}#${r.ply}`));

/* ---------------- TIER 0: the gameEval mirror ----------------
 * One pass per game, in game order, on Engine A. This is the ONLY thing Engine
 * A ever does — no searchmoves, no MultiPV changes, no null moves — so its
 * table state at every position is the table state production would have.
 */
async function tier0ForGame(g) {
  // uciEngine.ts:286 — ucinewgame once, before the loop, not per position.
  real.child.stdin.write("ucinewgame\nisready\n");
  real.multipv = null;
  const evals = [];
  for (const p of g.plies) {
    evals.push(await go(real, p.fenBefore, { multipv: MULTIPV }));
  }
  // The position after the final move: production evaluates it too, and the
  // last ply's `playedScore` is read from it.
  const last = g.plies[g.plies.length - 1];
  if (last) evals.push(await go(real, last.fenAfter, { multipv: MULTIPV }));
  return evals;
}

/* ---------------- TIER 1: the prober ----------------
 * Every search here clears the table first, and every operand of every
 * subtraction downstream is measured HERE — including `opponentBestAfter`,
 * which gameEval also carries. Reusing gameEval's copy is what put 166cp of
 * regime noise inside a 150cp threshold.
 */
async function tier1ForPly(p, next, rootLines) {
  const nfen = nullMoveFen(p.fenBefore);
  let threat = null, threatAlternative = null, threatAfter = null;
  let threatStillLegal = true, opponentBestAfter = null, counterfactualCostCp = null;
  let rootBest = null;
  const threatAfterAlternatives = [];
  let nullBest = null;

  if (nfen) {
    // The player's best move at fenBefore, measured HERE rather than read from
    // Tier 0. The free-tempo gate adds this to the threat, and Tier 0's copy is
    // a warm-table number: sampled near the 150cp bar, 12% of threat/no-threat
    // decisions flip depending on which engine measured it. MultiPV 3 matches
    // Tier 0's shape so the only difference left is the table.
    const rb = await go(prober, p.fenBefore, { multipv: 3 });
    rootBest = line(p.fenBefore, rb[0]);

    const n = await go(prober, nfen, { multipv: 2 });
    nullBest = n[0] || null;
    threat = line(nfen, n[0]);
    threatAlternative = line(nfen, n[1]);

    if (threat && n[0].pv?.length) {
      const tUci = n[0].pv[0];
      threatStillLegal = isLegalUci(p.fenAfter, tUci);

      // Both operands of the prophylaxis subtraction, same engine, same regime.
      const ob = await go(prober, p.fenAfter, { multipv: 1 });
      opponentBestAfter = line(p.fenAfter, ob[0]);

      if (threatStillLegal) {
        const ta = await go(prober, p.fenAfter, { multipv: 1, searchmoves: tUci });
        if (ta[0]) threatAfter = { san: uciToSan(p.fenAfter, tUci), score: toScore(ta[0]), pv: pvToSan(p.fenAfter, ta[0].pv), depth: DEPTH };
      }

      // ATTRIBUTION: the same threat replayed after each move we passed over.
      // "Did OUR move do this, or would anything have?" Alternatives come from
      // Tier 0's root lines but are re-searched here, so the comparison between
      // threatAfter and these stays inside one regime.
      for (const alt of rootLines.slice(0, 3)) {
        if (!alt || alt.san === p.san) continue;
        let fenAlt;
        try { const b = new Chess(p.fenBefore); if (!b.move(alt.san)) continue; fenAlt = b.fen(); } catch { continue; }
        // FIELD NAMES MATCH IntentProbe["threatAfterAlternatives"] EXACTLY:
        // { ourSan, score, stillLegal }. An earlier version emitted
        // { altSan, score, illegal } — same information, different spelling and
        // the opposite polarity — and `attributionOf` silently returned
        // "unknown" for all 835 plies rather than failing. The attribution gate
        // never ran, and Kd8 (which the founder rejected) came back confirmed.
        if (!isLegalUci(fenAlt, tUci)) {
          threatAfterAlternatives.push({ ourSan: alt.san, score: null, stillLegal: false });
          continue;
        }
        const r = await go(prober, fenAlt, { multipv: 1, searchmoves: tUci });
        threatAfterAlternatives.push({ ourSan: alt.san, score: toScore(r[0]), stillLegal: true });
      }
    }
  }

  // What the opponent's actual reply would have cost them had we simply passed.
  if (next && nfen && nullBest) {
    const actualUci = sanToUci(p.fenAfter, next.san);
    if (actualUci && isLegalUci(nfen, actualUci)) {
      const cf = await go(prober, nfen, { multipv: 1, searchmoves: actualUci });
      const bN = toScore(nullBest), aN = toScore(cf[0]);
      if (bN && aN && bN.mate === null && aN.mate === null && bN.cp !== null && aN.cp !== null) {
        counterfactualCostCp = bN.cp - aN.cp;
      }
    }
  }

  return { threat, threatAlternative, threatAfter, threatStillLegal, opponentBestAfter, rootBest, threatAfterAlternatives, counterfactualCostCp };
}

/* ---------------- sweep ---------------- */
const t0 = Date.now();
let processed = 0, abandoned = 0;

for (const g of GAMES) {
  if (g.plies.every((p) => done.has(`${g.file}#${p.ply}`))) continue;

  // Tier 0 is one uninterrupted walk of the game; it cannot be resumed
  // mid-game without changing the table state, so it is redone per game.
  let evals = null;
  for (let attempt = 0; attempt < 4 && !evals; attempt++) {
    try { evals = await tier0ForGame(g); }
    catch (e) { console.error(`  ${g.file} tier0 attempt ${attempt + 1}: ${e.message}`); await restartEngines(); }
  }
  if (!evals) { console.error(`  ABANDONED ${g.file} — tier0 never completed`); abandoned += g.plies.length; continue; }

  for (let i = 0; i < g.plies.length; i++) {
    const p = g.plies[i];
    if (done.has(`${g.file}#${p.ply}`)) continue;
    const next = g.plies[i + 1] || null;

    // rootLines are scored at fenBefore, where the side to move IS the mover,
    // so they need no conversion.
    const rootLines = (evals[i] || []).map((l) => line(p.fenBefore, l)).filter(Boolean);

    // playedScore IS the evaluation of the position the move produced — exactly
    // how fromGameEval derives it, with no extra search. But that evaluation is
    // reported from the side to move at fenAfter, which is the OPPONENT, so it
    // must be flipped to be read from ours.
    const afterLines = evals[i + 1] || [];
    const playedScore = afterLines[0] ? flip(toScore(afterLines[0])) : null;
    // The same number, left in the opponent's frame: that is the baseline a
    // threat is measured against, and it is already on their side.
    const bestAfterT0 = afterLines[0] ? line(p.fenAfter, afterLines[0]) : null;

    let t1 = null;
    for (let attempt = 0; attempt < 4 && !t1; attempt++) {
      try { t1 = await tier1ForPly(p, next, rootLines); }
      catch (e) { console.error(`  ${g.file}#${p.ply} tier1 attempt ${attempt + 1}: ${e.message}`); await restartEngines(); }
    }
    if (!t1) { abandoned++; console.error(`  ABANDONED ${g.file}#${p.ply} ${p.san}`); continue; }

    let moverHasPieces = true;
    try {
      const b = new Chess(p.fenBefore);
      const mover = b.turn();
      moverHasPieces = b.board().flat().some((sq) => sq && sq.color === mover && sq.type !== "p" && sq.type !== "k");
    } catch { /* default true: the guard only ever suppresses a claim */ }

    results.push({
      game: g.file, ply: p.ply, byPlayer: p.byPlayer,
      fenBefore: p.fenBefore, playedSan: p.san, fenAfter: p.fenAfter,
      lastCaptureSquare: p.lastCaptureSquare,
      // ── Tier 0: engine A, warm table, exactly what production's gameEval has
      rootLines,
      playedScore,
      opponentBestAfterTier0: bestAfterT0 ? bestAfterT0.score : null,
      opponentReplyTier0: next && afterLines[0]
        ? {
            san: next.san,
            bestSan: line(p.fenAfter, afterLines[0])?.san ?? null,
            // `best` is scored at fenAfter, where the opponent is to move —
            // already their frame.
            best: toScore(afterLines[0]),
            // `actual` PREFERS the line the same search gave their reply, so
            // that `best - actual` is zero when they played the engine's own
            // top move. Falling back to the evaluation of the position their
            // reply produced makes it a different search: measured on the 278
            // plies here where they played bestSan, that version reads a median
            // of 2cp but a max of 148cp. Mirrors fromGameEval.ts.
            actual: (() => {
              const inSame = afterLines
                .map((l) => line(p.fenAfter, l))
                .find((l) => l && l.san === next.san);
              if (inSame) return inSame.score;
              const produced = (evals[i + 2] || [])[0];
              // Scored where WE are to move, so flip it into their frame.
              return produced ? flip(toScore(produced)) : null;
            })(),
          }
        : null,
      moverHasPieces,
      // ── Tier 1: engine B, cold table before every search
      threat: t1.threat,
      threatAlternative: t1.threatAlternative,
      threatAfter: t1.threatAfter,
      threatStillLegal: t1.threatStillLegal,
      opponentBestAfterProbed: t1.opponentBestAfter ? t1.opponentBestAfter.score : null,
      rootBestProbed: t1.rootBest ? t1.rootBest.score : null,
      threatAfterAlternatives: t1.threatAfterAlternatives,
      counterfactualCostCp: t1.counterfactualCostCp,
    });
    processed++;

    if (processed % 10 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.error(
        `${results.length}/${TOTAL} searches=${searches} shortfalls=${depthShortfalls} ` +
        `respawns=${respawns} abandoned=${abandoned} ${el.toFixed(0)}s ` +
        `eta=${((el / processed) * (TOTAL - results.length) / 60).toFixed(0)}min`,
      );
      writeFileSync(OUT, JSON.stringify(results));
    }
  }
  writeFileSync(OUT, JSON.stringify(results));
}

writeFileSync(OUT, JSON.stringify(results));
console.error(
  `DONE ${results.length}/${TOTAL} plies, ${searches} searches, ${depthShortfalls} depth shortfalls, ` +
  `${respawns} respawns, ${abandoned} ABANDONED, ${((Date.now() - t0) / 1000).toFixed(0)}s`,
);
shuttingDown = true;
for (const E of [real, prober]) { try { E.child.stdin.write("quit\n"); } catch { /* gone */ } }
process.exit(0);

// The intent-corpus probe RECIPE, extracted from probe-corpus.mjs so that the
// native and lite-WASM sweeps run byte-identical orchestration and differ in
// exactly one thing: the engine behind the transport. Reimplementing the
// recipe per transport is how a measurement experiment quietly measures its
// own harness instead of the instrument.
//
// A transport is a dumb line pipe around two engine processes:
//   send(which, cmd)   — write one UCI command line ("real" | "prober")
//   onLine(which, cb)  — deliver every trimmed stdout line
//   onDeath(which, cb) — notify when an engine dies unexpectedly
//   restart()          — kill + respawn BOTH engines (they must re-handshake
//                        "uci/isready/ucinewgame/isready" on every spawn)
//   quit()             — final shutdown
//
// Engine roles (policy lives HERE, not in transports):
//   "real"   — the gameEval mirror. ucinewgame once per game, MultiPV set
//              once, positions searched in game order: its table state at
//              every position is the table state production would have.
//   "prober" — Tier 1. The table is cleared before EVERY search so no operand
//              of any downstream subtraction rides warm-table luck.
import { Chess } from "chess.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

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
 * OPPONENT's view of it, not ours. Getting this wrong does not throw; it
 * silently inverts every comparison for one side.
 */
const flip = (s) => (s ? { cp: s.cp === null ? null : -s.cp, mate: s.mate === null ? null : -s.mate } : null);

/* ---------------- games ---------------- */
export function loadGames(gamesJsonPath, only = null) {
  const runs = JSON.parse(readFileSync(gamesJsonPath, "utf8"));
  return runs
    .filter((g) => !only || only.some((o) => g.file.includes(o)))
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

/* ---------------- the sweep ---------------- */
export async function runProbeSweep({ games, out, depth, multipv = 3, transport, log = console.error }) {
  const DEPTH = depth;
  let searches = 0, depthShortfalls = 0, restarts = 0;

  // Per-engine UCI protocol state. The transport only moves lines; parsing
  // and search bookkeeping live here so both transports get the same bugs.
  const proto = {
    real:   { pending: null, rejectPending: null, lines: new Map(), reachedDepth: 0, multipv: null, clearBeforeEverySearch: false },
    prober: { pending: null, rejectPending: null, lines: new Map(), reachedDepth: 0, multipv: null, clearBeforeEverySearch: true },
  };

  for (const which of ["real", "prober"]) {
    transport.onLine(which, (l) => {
      const E = proto[which];
      if (l.startsWith("info ") && l.includes(" pv ")) {
        const dm = /\bdepth (\d+)/.exec(l);
        if (dm) E.reachedDepth = Math.max(E.reachedDepth, Number(dm[1]));
        const sc = /score (cp|mate) (-?\d+)/.exec(l);
        const pv = / pv (.+)$/.exec(l);
        if (!dm || !sc || !pv || Number(dm[1]) !== DEPTH) return;
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
    });
    transport.onDeath(which, (err) => {
      const E = proto[which];
      const rej = E.rejectPending;
      E.pending = null; E.rejectPending = null;
      if (rej) rej(err ?? new Error(`${which} engine died mid-search`));
    });
  }

  function go(which, fen, { multipv: mpv = 1, searchmoves = null } = {}) {
    searches++;
    const E = proto[which];
    E.reachedDepth = 0;
    E.lines = new Map();
    return new Promise((res, rej) => {
      E.pending = res;
      E.rejectPending = rej;
      try {
        if (E.clearBeforeEverySearch) transport.send(which, "ucinewgame\nisready");
        // Only re-send MultiPV when it actually changes. Engine A must look to
        // the engine exactly like production, which sets it once and never again.
        if (E.multipv !== mpv) {
          transport.send(which, `setoption name MultiPV value ${mpv}`);
          E.multipv = mpv;
        }
        transport.send(which, `position fen ${fen}\ngo depth ${DEPTH}${searchmoves ? " searchmoves " + searchmoves : ""}`);
      } catch (e) { rej(e); }
    });
  }

  async function restartEngines() {
    restarts++;
    proto.real.multipv = null;
    proto.prober.multipv = null;
    await transport.restart();
  }

  const line = (fen, l) => {
    if (!l || !l.pv || l.pv.length === 0) return null;
    const san = uciToSan(fen, l.pv[0]);
    if (!san) return null;
    return { san, score: toScore(l), pv: pvToSan(fen, l.pv), depth: DEPTH };
  };

  /* TIER 0: the gameEval mirror. One pass per game, in game order, on engine
   * "real" — no searchmoves, no null moves — so its table state at every
   * position is the table state production would have. */
  async function tier0ForGame(g) {
    transport.send("real", "ucinewgame\nisready"); // once per game, like uciEngine.ts
    proto.real.multipv = null;
    const evals = [];
    for (const p of g.plies) {
      evals.push(await go("real", p.fenBefore, { multipv }));
    }
    const last = g.plies[g.plies.length - 1];
    if (last) evals.push(await go("real", last.fenAfter, { multipv }));
    return evals;
  }

  /* TIER 1: the prober. Every operand of every downstream subtraction is
   * measured HERE — including opponentBestAfter, which gameEval also carries;
   * reusing gameEval's copy once put 166cp of regime noise inside a 150cp
   * threshold. */
  async function tier1ForPly(p, next, rootLines) {
    const nfen = nullMoveFen(p.fenBefore);
    let threat = null, threatAlternative = null, threatAfter = null;
    let threatStillLegal = true, opponentBestAfter = null, counterfactualCostCp = null;
    let rootBest = null;
    const threatAfterAlternatives = [];
    let nullBest = null;

    if (nfen) {
      // The player's best move at fenBefore, measured here rather than read
      // from Tier 0: sampled near the 150cp bar, 12% of threat/no-threat
      // decisions flip depending on which engine measured it. MultiPV 3
      // matches Tier 0's shape so the only difference left is the table.
      const rb = await go("prober", p.fenBefore, { multipv: 3 });
      rootBest = line(p.fenBefore, rb[0]);

      const n = await go("prober", nfen, { multipv: 2 });
      nullBest = n[0] || null;
      threat = line(nfen, n[0]);
      threatAlternative = line(nfen, n[1]);

      if (threat && n[0].pv?.length) {
        const tUci = n[0].pv[0];
        threatStillLegal = isLegalUci(p.fenAfter, tUci);

        // Both operands of the prophylaxis subtraction, same engine, same regime.
        const ob = await go("prober", p.fenAfter, { multipv: 1 });
        opponentBestAfter = line(p.fenAfter, ob[0]);

        if (threatStillLegal) {
          const ta = await go("prober", p.fenAfter, { multipv: 1, searchmoves: tUci });
          if (ta[0]) threatAfter = { san: uciToSan(p.fenAfter, tUci), score: toScore(ta[0]), pv: pvToSan(p.fenAfter, ta[0].pv), depth: DEPTH };
        }

        // ATTRIBUTION: the same threat replayed after each move we passed over.
        // FIELD NAMES MATCH IntentProbe["threatAfterAlternatives"] EXACTLY —
        // { ourSan, score, stillLegal }. A previous spelling with the opposite
        // polarity made attribution silently return "unknown" for all 835
        // plies, and Kd8 (founder-rejected) came back confirmed.
        for (const alt of rootLines.slice(0, 3)) {
          if (!alt || alt.san === p.san) continue;
          let fenAlt;
          try { const b = new Chess(p.fenBefore); if (!b.move(alt.san)) continue; fenAlt = b.fen(); } catch { continue; }
          if (!isLegalUci(fenAlt, tUci)) {
            threatAfterAlternatives.push({ ourSan: alt.san, score: null, stillLegal: false });
            continue;
          }
          const r = await go("prober", fenAlt, { multipv: 1, searchmoves: tUci });
          threatAfterAlternatives.push({ ourSan: alt.san, score: toScore(r[0]), stillLegal: true });
        }
      }
    }

    // What the opponent's actual reply would have cost them had we passed.
    if (next && nfen && nullBest) {
      const actualUci = sanToUci(p.fenAfter, next.san);
      if (actualUci && isLegalUci(nfen, actualUci)) {
        const cf = await go("prober", nfen, { multipv: 1, searchmoves: actualUci });
        const bN = toScore(nullBest), aN = toScore(cf[0]);
        if (bN && aN && bN.mate === null && aN.mate === null && bN.cp !== null && aN.cp !== null) {
          counterfactualCostCp = bN.cp - aN.cp;
        }
      }
    }

    return { threat, threatAlternative, threatAfter, threatStillLegal, opponentBestAfter, rootBest, threatAfterAlternatives, counterfactualCostCp };
  }

  /* ---------------- sweep + resume ---------------- */
  let results = [];
  if (existsSync(out)) {
    try {
      results = JSON.parse(readFileSync(out, "utf8"));
      log(`resuming from ${results.length} completed plies`);
    } catch { results = []; }
  }
  const done = new Set(results.map((r) => `${r.game}#${r.ply}`));
  const TOTAL = games.reduce((n, g) => n + g.plies.length, 0);
  log(`games: ${games.length}  plies: ${TOTAL}  depth: ${DEPTH}  threads: engine default (1)`);

  const t0 = Date.now();
  let processed = 0, abandoned = 0;

  for (const g of games) {
    if (g.plies.every((p) => done.has(`${g.file}#${p.ply}`))) continue;

    // Tier 0 is one uninterrupted walk of the game; it cannot be resumed
    // mid-game without changing the table state, so it is redone per game.
    let evals = null;
    for (let attempt = 0; attempt < 4 && !evals; attempt++) {
      try { evals = await tier0ForGame(g); }
      catch (e) { log(`  ${g.file} tier0 attempt ${attempt + 1}: ${e.message}`); await restartEngines(); }
    }
    if (!evals) { log(`  ABANDONED ${g.file} — tier0 never completed`); abandoned += g.plies.length; continue; }

    for (let i = 0; i < g.plies.length; i++) {
      const p = g.plies[i];
      if (done.has(`${g.file}#${p.ply}`)) continue;
      const next = g.plies[i + 1] || null;

      // rootLines are scored at fenBefore, where the side to move IS the
      // mover, so they need no conversion.
      const rootLines = (evals[i] || []).map((l) => line(p.fenBefore, l)).filter(Boolean);

      // playedScore IS the evaluation of the position the move produced, but
      // reported from the side to move at fenAfter — the OPPONENT — so flip.
      const afterLines = evals[i + 1] || [];
      const playedScore = afterLines[0] ? flip(toScore(afterLines[0])) : null;
      const bestAfterT0 = afterLines[0] ? line(p.fenAfter, afterLines[0]) : null;

      let t1 = null;
      for (let attempt = 0; attempt < 4 && !t1; attempt++) {
        try { t1 = await tier1ForPly(p, next, rootLines); }
        catch (e) { log(`  ${g.file}#${p.ply} tier1 attempt ${attempt + 1}: ${e.message}`); await restartEngines(); }
      }
      if (!t1) { abandoned++; log(`  ABANDONED ${g.file}#${p.ply} ${p.san}`); continue; }

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
        // ── Tier 0: engine "real", warm table — exactly production's gameEval
        rootLines,
        playedScore,
        opponentBestAfterTier0: bestAfterT0 ? bestAfterT0.score : null,
        opponentReplyTier0: next && afterLines[0]
          ? {
              san: next.san,
              bestSan: line(p.fenAfter, afterLines[0])?.san ?? null,
              best: toScore(afterLines[0]),
              // `actual` PREFERS the line the same search gave their reply so
              // best - actual is zero when they played the engine's own top
              // move; the fallback is a different search (median 2cp, max
              // 148cp of drift on the plies where they played bestSan).
              actual: (() => {
                const inSame = afterLines
                  .map((l) => line(p.fenAfter, l))
                  .find((l) => l && l.san === next.san);
                if (inSame) return inSame.score;
                const produced = (evals[i + 2] || [])[0];
                return produced ? flip(toScore(produced)) : null;
              })(),
            }
          : null,
        moverHasPieces,
        // ── Tier 1: engine "prober", cold table before every search
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
        log(
          `${results.length}/${TOTAL} searches=${searches} shortfalls=${depthShortfalls} ` +
          `respawns=${restarts} abandoned=${abandoned} ${el.toFixed(0)}s ` +
          `eta=${((el / processed) * (TOTAL - results.length) / 60).toFixed(0)}min`,
        );
        writeFileSync(out, JSON.stringify(results));
      }
    }
    writeFileSync(out, JSON.stringify(results));
  }

  writeFileSync(out, JSON.stringify(results));
  log(
    `DONE ${results.length}/${TOTAL} plies, ${searches} searches, ${depthShortfalls} depth shortfalls, ` +
    `${restarts} respawns, ${abandoned} ABANDONED, ${((Date.now() - t0) / 1000).toFixed(0)}s`,
  );
  await transport.quit();
  return { plies: results.length, searches, depthShortfalls, restarts, abandoned };
}

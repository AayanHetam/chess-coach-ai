/**
 * Apply the REAL intent module to probe18 output and report what it says.
 *
 * probe18 stores each tier under its own name, because the two are measured by
 * different engines and mixing them was a real bug:
 *
 *   opponentBestAfterTier0    warm table, the number production's gameEval has
 *   opponentBestAfterProbed   cold table, measured beside `threatAfter`
 *
 * Both are handed to the module. It is the module's job — not this script's —
 * to decide which one it may subtract from what.
 *
 * The two derived inputs, `position` and `tempting`, are computed here by the
 * module's own functions rather than re-implemented, so harness and module
 * cannot drift.
 *
 *   node_modules/.bin/tsx scripts/intent/apply-corpus.ts <probes.json> <out.json>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";
import { PIECE_VALUE_CP } from "@/lib/tactics/utils";
import {
  buildPositionFacts,
  isTemptingReply,
  didCaptureThreatPiece,
  threatAfterEvasions,
  isLegalSan,
  nullMoveFen,
} from "@/lib/intent/positionFacts";
import { computeIntentFacts } from "@/lib/intent/intentFacts";
import type { IntentProbe } from "@/lib/intent/types";

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error("usage: tsx scripts/intent/apply-corpus.ts <probes.json> <out.json>");
  process.exit(1);
}

interface Raw {
  game: string;
  ply: number;
  byPlayer: boolean | null;
  fenBefore: string;
  playedSan: string;
  fenAfter: string;
  lastCaptureSquare: string | null;
  rootLines: IntentProbe["rootLines"];
  playedScore: IntentProbe["playedScore"];
  opponentBestAfterTier0: IntentProbe["playedScore"];
  opponentReplyTier0: {
    san: string;
    bestSan: string | null;
    best: IntentProbe["playedScore"];
    actual: IntentProbe["playedScore"];
  } | null;
  moverHasPieces: boolean;
  threat: IntentProbe["threat"];
  threatAlternative: IntentProbe["threatAlternative"];
  threatAfter: IntentProbe["threatAfter"];
  threatStillLegal: boolean;
  opponentBestAfterProbed: IntentProbe["playedScore"];
  rootBestProbed: IntentProbe["playedScore"];
  threatAfterAlternatives: IntentProbe["threatAfterAlternatives"];
  counterfactualCostCp: number | null;
}

const raw: Raw[] = JSON.parse(readFileSync(inPath, "utf8"));

/**
 * VALIDATE THE JSON, do not merely assert its type.
 *
 * The `Raw` interface above is a claim about a file this program did not write,
 * and TypeScript checks the claim, not the file. An earlier probe18 emitted the
 * alternatives as `{ altSan, score, illegal }` where the module reads
 * `{ ourSan, score, stillLegal }` — same information, different spelling, and
 * `illegal` is the negation of `stillLegal`. Nothing threw. `attributionOf`
 * simply returned "unknown" for all 835 plies, the attribution gate never ran,
 * and a position the founder had explicitly REJECTED came back confirmed.
 *
 * A silent "unknown" is the most expensive failure mode this module has, so the
 * shape is checked once, loudly, before any of it is believed.
 */
{
  const problems: string[] = [];
  let withAlts = 0;
  for (const r of raw) {
    for (const a of r.threatAfterAlternatives ?? []) {
      const keys = Object.keys(a).sort().join(",");
      if (keys !== "ourSan,score,stillLegal") {
        problems.push(`${r.game}#${r.ply}: alternative has keys {${keys}}, expected {ourSan,score,stillLegal}`);
      }
      withAlts++;
    }
  }
  if (problems.length) {
    console.error(`\nFATAL: probe file does not match IntentProbe's shape.\n`);
    for (const p of problems.slice(0, 5)) console.error(`  ${p}`);
    console.error(`  …${problems.length} total\n`);
    process.exit(1);
  }
  console.error(`shape check: ${withAlts} threat alternatives, all well-formed`);
}

/** Value of the piece the opponent took last ply, so a recapture prices both halves. */
const prevCaptureValue = new Map<string, number>();
{
  const byGame = new Map<string, Raw[]>();
  for (const r of raw) {
    if (!byGame.has(r.game)) byGame.set(r.game, []);
    byGame.get(r.game)!.push(r);
  }
  for (const list of Array.from(byGame.values())) {
    list.sort((a, b) => a.ply - b.ply);
    for (let i = 1; i < list.length; i++) {
      try {
        const g = new Chess(list[i - 1].fenBefore);
        const mv = g.move(list[i - 1].playedSan);
        if (mv?.captured) {
          prevCaptureValue.set(`${list[i].game}#${list[i].ply}`, PIECE_VALUE_CP[mv.captured] ?? 0);
        }
      } catch { /* leave unknown; the module then declines to price it */ }
    }
  }
}

let buildFailures = 0;
const rows = raw.map((r) => {
  const position = buildPositionFacts(
    r.fenBefore,
    r.playedSan,
    r.lastCaptureSquare,
    prevCaptureValue.get(`${r.game}#${r.ply}`) ?? null,
  );
  if (!position) buildFailures++;

  const passedFen = nullMoveFen(r.fenBefore);

  const probe: IntentProbe = {
    fenBefore: r.fenBefore,
    playedSan: r.playedSan,
    fenAfter: r.fenAfter,
    rootLines: r.rootLines,
    threat: r.threat,
    threatAfter: r.threatAfter,
    threatAlternative: r.threatAlternative,
    threatStillLegal: r.threatStillLegal,
    threatPieceCaptured: r.threat
      ? didCaptureThreatPiece(r.fenBefore, r.playedSan, r.threat.san)
      : null,
    // Play out the opponent's answers to a check and see whether the threat is
    // actually still available — the module no longer assumes it is. fenBefore
    // is the baseline world the threat was priced in; without it the met
    // distinction fails closed and valid claims die with the invalid ones.
    threatEvasions: r.threat ? threatAfterEvasions(r.fenAfter, r.threat.san, r.fenBefore) : null,
    // Tier 0 — what production's gameEval carries.
    opponentBestAfter: r.opponentBestAfterTier0,
    // Tier 1 — measured beside threatAfter, and the ONLY thing that may be
    // subtracted from it.
    opponentBestAfterProbed: r.opponentBestAfterProbed,
    // Same-regime root score for the free-tempo gate; see rootBestProbed.
    rootBestProbed: r.rootBestProbed,
    threatAfterAlternatives: r.threatAfterAlternatives ?? [],
    playedScore: r.playedScore,
    moverHasPieces: r.moverHasPieces,
    position,
    opponentReply: r.opponentReplyTier0 && r.opponentReplyTier0.bestSan
      ? {
          san: r.opponentReplyTier0.san,
          actual: r.opponentReplyTier0.actual,
          bestSan: r.opponentReplyTier0.bestSan,
          best: r.opponentReplyTier0.best,
          counterfactualCostCp: r.counterfactualCostCp,
          // The module's own definition of temptation — never a copy of it.
          tempting: isTemptingReply(r.fenAfter, r.opponentReplyTier0.san),
          replyExistedBefore: passedFen ? isLegalSan(passedFen, r.opponentReplyTier0.san) : null,
        }
      : null,
  };

  const facts = computeIntentFacts(probe);
  return {
    game: r.game,
    ply: r.ply,
    moveNumber: Math.floor(r.ply / 2) + 1,
    color: r.ply % 2 === 0 ? "w" : "b",
    byPlayer: r.byPlayer,
    fenBefore: r.fenBefore,
    fenAfter: r.fenAfter,
    playedSan: r.playedSan,
    positionNull: position === null,
    facts,
    rootTop: r.rootLines.slice(0, 3).map((l) => ({ san: l.san, ...l.score })),
    playedScore: r.playedScore,
    threat: r.threat ? { san: r.threat.san, ...r.threat.score } : null,
    threatAfter: r.threatAfter ? { san: r.threatAfter.san, ...r.threatAfter.score } : null,
    opponentBestAfterTier0: r.opponentBestAfterTier0,
    opponentBestAfterProbed: r.opponentBestAfterProbed,
    opponentReply: probe.opponentReply,
  };
});

writeFileSync(outPath, JSON.stringify(rows, null, 1));

/* ---------------- summary ---------------- */
const n = rows.length;
const by = (k: string) => rows.filter((r) => r.facts.purpose === k).length;
const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;

console.log(`\n=== ${n} plies from ${new Set(rows.map((r) => r.game)).size} games ===`);
console.log(`buildPositionFacts returned null: ${buildFailures} (${pct(buildFailures)})`);
console.log(`\nPURPOSE`);
for (const p of ["mate", "material", "trap", "escape", "prophylaxis", "none"]) {
  console.log(`  ${p.padEnd(12)} ${String(by(p)).padStart(4)}  ${pct(by(p))}`);
}
const speaks = n - by("none");
console.log(`\n  says something: ${speaks} (${pct(speaks)})   silent: ${by("none")} (${pct(by("none"))})`);

const withCost = rows.filter((r) => r.facts.cost !== null).length;
const quiet = rows.filter((r) => r.facts.quiet).length;
console.log(`\n  cost reported: ${withCost} (${pct(withCost)})   quiet: ${quiet}`);

// Nothing user-facing may carry a mate-sized centipawn number.
const leaks = rows.filter((r) => {
  const f = r.facts;
  const vals = [
    f.cost?.lossCp, f.material?.wonCp, f.material?.capturedCp, f.escape?.valueCp,
    f.prophylaxis?.swingCp, f.prophylaxis?.scoreBeforeCp, f.prophylaxis?.scoreAfterCp,
    f.trap?.costCp,
  ];
  return vals.some((v) => typeof v === "number" && Math.abs(v) > 5000);
});
console.log(`\n  MATE-SIZED CP LEAKS: ${leaks.length}`);
for (const l of leaks.slice(0, 5)) console.log(`    ${l.game} ply${l.ply} ${l.playedSan}`);

// How often was the relative prophylaxis route usable at all?
const proph = rows.filter((r) => r.facts.prophylaxis !== null);
const skippedRel = rows.filter((r) => r.facts.notes.some((s) => s.includes("no same-regime baseline")));
console.log(`\n  prophylaxis claims: ${proph.length}   relative route skipped for want of a baseline: ${skippedRel.length}`);

const unaddr = rows.filter((r) => r.facts.unaddressedThreat !== null);
const unaddrMate = unaddr.filter((r) => r.facts.unaddressedThreat!.stillMates);
console.log(`  unaddressed threats: ${unaddr.length}   of which still mate: ${unaddrMate.length}`);
{
  // Per-ply counts overstate: a lost ending repeats the same threat every ply.
  const eps = new Set(unaddrMate.map((r) => `${r.game}#${Math.floor(r.ply / 6)}`));
  const byPlayer = unaddrMate.filter((r) => r.byPlayer === true).length;
  console.log(`    ~episodes: ${eps.size}   on the PLAYER's own moves: ${byPlayer}`);
}

const playerRows = rows.filter((r) => r.byPlayer === true);
if (playerRows.length) {
  const ps = playerRows.filter((r) => r.facts.purpose !== "none").length;
  console.log(`\n  on the PLAYER's own moves (${playerRows.length}): speaks ${ps} (${((ps / playerRows.length) * 100).toFixed(1)}%)`);
}
console.log(`\nwrote ${outPath}`);

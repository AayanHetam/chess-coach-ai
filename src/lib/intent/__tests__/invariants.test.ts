import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "chess.js";
import { PIECE_VALUE_CP } from "@/lib/tactics/utils";
import { buildPositionFacts, isTemptingReply } from "../positionFacts";
import { computeIntentFacts, toCp } from "../intentFacts";
import type { EngineLine, IntentProbe, IntentScore } from "../types";

/**
 * PROPERTY TESTS over real master games.
 *
 * The rest of this suite is fixtures — positions chosen because they already
 * broke something. That is a regression net, not a contract, and it hid a lot:
 * an adversarial audit swept these same ten games and found 11.3% of moves
 * either crashing or producing a confidently false claim, with all 37 tests
 * green. Every fixture was a position the thresholds had been calibrated on.
 *
 * These assert INVARIANTS instead, over every move of every game — properties
 * that must hold for inputs nobody thought to write down. They would have
 * caught eleven of the fourteen defects that audit found.
 */

const GAMES_DIR = join(process.cwd(), "scripts/synthetic-tester/games");

/** Strip PGN headers and comments; return the SAN move list. */
function movesFromPgn(pgn: string): string[] {
  const game = new Chess();
  try {
    game.loadPgn(pgn);
    return game.history();
  } catch {
    return [];
  }
}

interface Position {
  game: string;
  ply: number;
  fenBefore: string;
  san: string;
  fenAfter: string;
  lastCaptureSquare: string | null;
}

function allPositions(): Position[] {
  const out: Position[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(GAMES_DIR).filter((f) => f.endsWith(".pgn")).sort();
  } catch {
    return out;
  }
  for (const f of files) {
    const moves = movesFromPgn(readFileSync(join(GAMES_DIR, f), "utf8"));
    const board = new Chess();
    let lastCaptureSquare: string | null = null;
    moves.forEach((san, ply) => {
      const fenBefore = board.fen();
      let mv;
      try {
        mv = board.move(san);
      } catch {
        return;
      }
      out.push({ game: f, ply, fenBefore, san: mv.san, fenAfter: board.fen(), lastCaptureSquare });
      lastCaptureSquare = mv.captured ? mv.to : null;
    });
  }
  return out;
}

const POSITIONS = allPositions();

/** A plausible probe for a position, so the engine-side rules get exercised too. */
function probeForWith(
  p: Position,
  position: ReturnType<typeof buildPositionFacts>,
  score: IntentScore = { cp: 20, mate: null },
): IntentProbe {
  const line = (san: string, s: IntentScore): EngineLine => ({ san, score: s, pv: [san], depth: 16 });
  return {
    fenBefore: p.fenBefore,
    playedSan: p.san,
    fenAfter: p.fenAfter,
    rootLines: [line(p.san, score), line(p.san, { cp: 0, mate: null })],
    opponentBestAfterProbed: null,
    threat: null,
    threatAfter: null,
    threatAlternative: null,
    opponentBestAfter: null,
    threatAfterAlternatives: [],
    threatStillLegal: true,
    threatPieceCaptured: null,
    playedScore: score,
    moverHasPieces: true,
    position,
    opponentReply: null,
  };
}

/**
 * Board facts for every position, computed ONCE.
 *
 * Five separate assertions each used to sweep all 716 moves independently, so
 * buildPositionFacts ran five times over the same input. That made this file
 * take 20-40s, which under full-suite parallelism starved unrelated tests into
 * 20s timeouts — the property suite was turning the whole repo red. Sharing the
 * work costs no coverage: every position is still exercised.
 */
interface Computed {
  p: Position;
  facts: ReturnType<typeof buildPositionFacts>;
  buildError: string | null;
}
const COMPUTED: Computed[] = POSITIONS.map((p) => {
  try {
    return { p, facts: buildPositionFacts(p.fenBefore, p.san, p.lastCaptureSquare), buildError: null };
  } catch (e) {
    return { p, facts: null, buildError: (e as Error).message };
  }
});

/** Derived intent for every position, likewise computed once. */
const DERIVED = COMPUTED.map(({ p, facts }) => {
  try {
    return { p, out: computeIntentFacts(probeForWith(p, facts)), error: null as string | null };
  } catch (e) {
    return { p, out: null, error: (e as Error).message };
  }
});

describe("property tests over real master games", () => {
  it("has games to test", () => {
    expect(POSITIONS.length).toBeGreaterThan(500);
  });

  it("buildPositionFacts NEVER throws on a legal move", () => {
    // 17 of 716 moves crashed an earlier version out of a function documented
    // to return null — all of them king moves out of check.
    const crashes = COMPUTED.filter((c) => c.buildError)
      .map((c) => `${c.p.game} ply${c.p.ply} ${c.p.san}: ${c.buildError}`);
    expect(crashes.slice(0, 5)).toEqual([]);
  });

  it("computeIntentFacts NEVER throws", () => {
    const crashes = DERIVED.filter((d) => d.error)
      .map((d) => `${d.p.game} ply${d.p.ply} ${d.p.san}: ${d.error}`);
    expect(crashes.slice(0, 5)).toEqual([]);
  });

  it("no material figure is ever mate-sized or king-sized", () => {
    // PIECE_VALUE_CP.k is a 99999 sentinel meaning "never trade this". Reading
    // it as material priced every check evasion at 999.99 pawns.
    const bad: string[] = [];
    for (const { p, facts: f } of COMPUTED) {
      if (!f) continue;
      if (Math.abs(f.materialSwingCp) > 2000) bad.push(`${p.game} ${p.san} swing=${f.materialSwingCp}`);
      if (f.escapedValueCp > PIECE_VALUE_CP.q) bad.push(`${p.game} ${p.san} escaped=${f.escapedValueCp}`);
      if (f.capturedCp > PIECE_VALUE_CP.q) bad.push(`${p.game} ${p.san} captured=${f.capturedCp}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("a king move is never reported as escaping material", () => {
    const bad = COMPUTED
      .filter(({ facts: f }) => f && f.movedPiece === "k" && f.escapedAttack)
      .map(({ p }) => `${p.game} ply${p.ply} ${p.san}`);
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("no user-facing centipawn field ever leaks a mate score", () => {
    // Every field a student could be shown, checked against a bound far below
    // MATE_CP. This is the invariant that "COST 30929cp" violated.
    const bad: string[] = [];
    for (const { p, out: f } of DERIVED) {
      if (!f) continue;
      const checks: [string, number | null | undefined][] = [
        ["cost.lossCp", f.cost?.lossCp],
        ["material.wonCp", f.material?.wonCp],
        ["material.capturedCp", f.material?.capturedCp],
        ["escape.valueCp", f.escape?.valueCp],
        ["prophylaxis.swingCp", f.prophylaxis?.swingCp],
        ["prophylaxis.scoreBeforeCp", f.prophylaxis?.scoreBeforeCp],
        ["prophylaxis.scoreAfterCp", f.prophylaxis?.scoreAfterCp],
        ["trap.costCp", f.trap?.costCp],
      ];
      for (const [name, v] of checks) {
        if (typeof v === "number" && Math.abs(v) > 5000) bad.push(`${p.game} ${p.san} ${name}=${v}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("no note or fact ever contains an absurd number", () => {
    // A sentinel (Number.MAX_SAFE_INTEGER) meaning "incomparable" reached both a
    // stored fact and a user-facing note: "moves we did not play answer Qg4
    // 9007199254740991cp better". Any number a student could read must stay
    // inside the range where centipawns mean material.
    const bad: string[] = [];
    for (const { p, out: f } of DERIVED) {
      if (!f) continue;
      const attrib = f.prophylaxis?.attributionCp;
      if (typeof attrib === "number" && Math.abs(attrib) > 5000) {
        bad.push(`${p.game} ${p.san} attributionCp=${attrib}`);
      }
      for (const note of f.notes) {
        const m = note.match(/(\d{5,})/);
        if (m) bad.push(`${p.game} ${p.san} note contains ${m[1]}: ${note.slice(0, 60)}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("isTemptingReply never throws, on any legal reply or on rubbish", () => {
    const crashes: string[] = [];
    for (const p of POSITIONS.slice(0, 200)) {
      try {
        isTemptingReply(p.fenBefore, p.san);
      } catch (e) {
        crashes.push(`${p.game} ${p.san}: ${(e as Error).message}`);
      }
    }
    for (const junk of ["", "not a fen", "8/8/8/8/8/8/8/8 w - - 0 1", "///// w"]) {
      try {
        isTemptingReply(junk, "e4");
      } catch (e) {
        crashes.push(`junk ${JSON.stringify(junk)}: ${(e as Error).message}`);
      }
    }
    expect(crashes.slice(0, 5)).toEqual([]);
  });

  it("buildPositionFacts returns null rather than throwing on malformed input", () => {
    for (const junk of ["", "not a fen", "///// w", "8/8/8/8/8/8/8/8 w - - 0 1"]) {
      expect(buildPositionFacts(junk, "e4")).toBeNull();
    }
    // legal FEN, illegal move
    expect(buildPositionFacts("4k3/8/8/8/8/8/8/4K3 w - - 0 1", "Qxh8")).toBeNull();
  });

  it("a mate on ONE side of a comparison never produces a centipawn claim", () => {
    // The leak needs a MIXED comparison — a mate against a material score.
    // An earlier version of this test put the same mate on both sides, so the
    // "both are mates" guard returned first and the test passed without ever
    // constructing the case it was written for. It survived a mutation that
    // removed the mate guard from diffCp entirely.
    const line = (san: string, score: IntentScore): EngineLine => ({ san, score, pv: [san], depth: 16 });
    const bad: string[] = [];

    for (const p of POSITIONS.slice(0, 200)) {
      const position = buildPositionFacts(p.fenBefore, p.san, p.lastCaptureSquare);
      const mixes: [string, IntentScore, IntentScore][] = [
        ["best mates, played does not", { cp: null, mate: 2 }, { cp: 30, mate: null }],
        ["played mates, best does not", { cp: 30, mate: null }, { cp: null, mate: 2 }],
        ["played is mated, best is fine", { cp: 30, mate: null }, { cp: null, mate: -2 }],
        ["best is mated, played is fine", { cp: null, mate: -2 }, { cp: 30, mate: null }],
      ];
      for (const [label, bestScore, playedScore] of mixes) {
        const probe: IntentProbe = {
          fenBefore: p.fenBefore,
          playedSan: p.san,
          fenAfter: p.fenAfter,
          rootLines: [line(p.san, bestScore), line(p.san, { cp: 0, mate: null })],
          opponentBestAfterProbed: null,
          threat: line("Qh5", { cp: 300, mate: null }),
          threatAfter: line("Qh5", { cp: null, mate: -3 }),
          threatPieceCaptured: null,
          opponentBestAfter: { cp: 250, mate: null },
          threatAfterAlternatives: [],
          threatAlternative: line("Nf3", { cp: 10, mate: null }),
          threatStillLegal: true,
          playedScore,
          moverHasPieces: true,
          position,
          opponentReply: {
            san: p.san,
            actual: { cp: null, mate: -2 },
            bestSan: p.san,
            best: { cp: 250, mate: null },
            tempting: true,
            replyExistedBefore: true,
            counterfactualCostCp: 0,
          },
        };
        const f = computeIntentFacts(probe);
        const fields: [string, number | null | undefined][] = [
          ["cost.lossCp", f.cost?.lossCp],
          ["trap.costCp", f.trap?.costCp],
          ["prophylaxis.swingCp", f.prophylaxis?.swingCp],
          ["prophylaxis.scoreAfterCp", f.prophylaxis?.scoreAfterCp],
        ];
        for (const [name, v] of fields) {
          if (typeof v === "number" && Math.abs(v) > 5000) {
            bad.push(`${p.game} ${p.san} [${label}] ${name}=${v}`);
          }
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it("toCp is documented as lossy and must not be used to subtract mates", () => {
    // Guards the reason diffCp exists: collapsing then subtracting reads as pawns.
    const mateIn1 = toCp({ cp: null, mate: 1 })!;
    const mateIn16 = toCp({ cp: null, mate: 16 })!;
    expect(mateIn1 - mateIn16).toBe(15); // meaningless as centipawns — hence diffCp
  });
});

/**
 * PR-CI-3 gate: known-bad fixture suite for the BLOCKING-grade referee
 * (CONTRACT_INVERSION_PLAN.md §7 CI-3 gate).
 *
 * Required detections (100%, each as at least one ERROR-severity finding):
 *   invented pin, wrong eval, phantom square, wrong mate distance,
 *   unconfirmed tactical keyword, stale suggestion, illegitimate
 *   hypothetical line
 * plus 2 clean controls with ZERO findings (the audit-#35 0-false-fire
 * discipline). Fully deterministic — no network; the one Haiku surface
 * (relational claims) is tested with an injected parser.
 */
import { describe, it, expect } from "vitest";
import {
  MAX_RELATIONAL_PARSES_PER_REVIEW,
  buildVoterSnapshotForInsight,
  refereeInsight,
  refereeInsightRelational,
} from "@/lib/contract/referee";
import type { RefereeFinding } from "@/lib/contract/referee";
import { evalFact, makeInsight } from "./insightFactory";

const OPTS = { userRating: 1500, correlationId: "referee-test" } as const;

function errors(findings: RefereeFinding[]): RefereeFinding[] {
  return findings.filter((f) => f.severity === "error");
}

// ── Known-bad fixture suite: 100% detection at error severity ───────────────
describe("refereeInsight — known-bad fixtures (plan CI-3 gate)", () => {
  it("bad 1 — invented pin (tactical keyword without a pin motif)", () => {
    // ROUND 2: board-anchored (d4/d8 occupied) — un-anchored keyword prose
    // is the definitional-exemption class (refereeChecks.test.ts control).
    const r = refereeInsight(
      "Your bishop pins the knight on d4 against the queen on d8 — a devastating pin.",
      makeInsight(),
      OPTS,
    );
    const hits = errors(r.findings).filter((f) => f.check === "tactical_keyword");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].span.toLowerCase()).toContain("pin");
  });

  it("bad 2 — wrong eval (figure no contract eval is within ±0.3 of)", () => {
    const r = refereeInsight("After this you are completely lost at +9.00.", makeInsight(), OPTS);
    const hits = errors(r.findings).filter(
      (f) => f.check === "eval_display" && f.category === "eval_unbacked",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].span).toBe("+9.00");
  });

  it("bad 3 — phantom square (claim verb on a square not in the contract)", () => {
    const r = refereeInsight("Your rook on h5 attacks the king.", makeInsight(), OPTS);
    const hits = errors(r.findings).filter(
      (f) => f.check === "san_whitelist" && f.category === "square_unknown",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].span).toBe("h5");
  });

  it("bad 4 — wrong mate distance (mate claim the contract cannot back)", () => {
    const r = refereeInsight("You missed a forced mate in 3 here!", makeInsight(), OPTS);
    const evalHits = errors(r.findings).filter(
      (f) => f.check === "eval_display" && f.category === "mate_distance_wrong",
    );
    expect(evalHits.length).toBeGreaterThanOrEqual(1);
    // The per-insight Stage-9 mate scanner fires too: mate_in_n is NONE for
    // this insight (the game_review-anchoring unlock, plan §4 check 5).
    const stage9Hits = r.findings.filter((f) => f.check === "stage9_mate_in_n");
    expect(stage9Hits.length).toBeGreaterThanOrEqual(1);
  });

  it("bad 5 — unconfirmed tactical keyword (skewer never detected)", () => {
    // ROUND 2: board-anchored on the licensed d8 square (see bad 1 note).
    const r = refereeInsight("This skewer of the queen on d8 wins the game on the spot.", makeInsight(), OPTS);
    const hits = errors(r.findings).filter((f) => f.check === "tactical_keyword");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].span.toLowerCase()).toContain("skewer");
  });

  it("bad 6 — impossible suggestion (recommended move neither contract-backed nor legal)", () => {
    // ROUND 2 NARROWING (arming PR must know): the plan-intent legality pool
    // (fix 5b) licenses recommendations of moves that are LEGAL from the
    // insight's FENs ("You should have played Qh4" — Qd8-h4 is legal for
    // Black — no longer fires). The san_unknown class this fixture pins is
    // now the IMPOSSIBLE recommendation: Qh5 is reachable by no piece from
    // either FEN under either side to move.
    const r = refereeInsight("You should have played Qh5 instead.", makeInsight(), OPTS);
    const hits = errors(r.findings).filter(
      (f) => f.check === "san_whitelist" && f.category === "san_unknown",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].span).toBe("Qh5");
  });

  it("bad 6 control — a LEGAL uncontracted recommendation is plan-intent licensed (round-2 fix 5b)", () => {
    const r = refereeInsight("You should have played Qh4 instead.", makeInsight(), OPTS);
    expect(r.findings.filter((f) => f.check === "san_whitelist")).toEqual([]);
  });

  it("bad 7 — illegitimate hypothetical line (invented continuation)", () => {
    const r = refereeInsight(
      "The crushing line was Qh5 g6 Qxe5 and Black collapses.",
      makeInsight(),
      OPTS,
    );
    const hits = errors(r.findings).filter(
      (f) => f.check === "san_whitelist" && f.category === "hypothetical_line_off_contract",
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].span).toBe("Qh5 g6 Qxe5");
    // Fully invented — not even the widened window rule accepts it.
    expect(hits[0].wouldPassWidenedWindow).toBe(false);
  });
});

// ── Clean controls: 0 false fires (audit #35, mandatory before any arming) ──
describe("refereeInsight — clean controls (0-false-fire gate)", () => {
  it("control 1 — PV-prefix line, correct evals, licensed fork keyword", () => {
    const r = refereeInsight(
      "Ne6 was the move! After Ne6 Qd7 Nxg7 the knight forks queen and king, " +
        "swinging the eval to +3.20, while Bd3 leaves you at -2.12.",
      makeInsight(),
      OPTS,
    );
    expect(r.findings).toEqual([]);
    expect(r.errorCount).toBe(0);
    expect(r.warnCount).toBe(0);
  });

  it("control 2 — whitelisted squares with claim verbs, no invented facts", () => {
    const r = refereeInsight(
      "The knight on d4 could jump to e6, hitting the queen on d8 and the pawn on g7.",
      makeInsight(),
      OPTS,
    );
    expect(r.findings).toEqual([]);
  });
});

// ── Strict-vs-widened hypothetical rule (plan §4.3) ─────────────────────────
describe("refereeInsight — strict PV-prefix hypothetical rule", () => {
  it("mid-PV window quote fails STRICT prefix but is downgraded to warn with arming telemetry", () => {
    // "Qd7 Nxg7" is a contiguous window of PV0 (Ne6 Qd7 Nxg7) but NOT a
    // prefix — the measurement-widened rule accepts it, the blocking rule
    // flags it at warn severity with wouldPassWidenedWindow for the CI-4/5
    // 30-game false-positive measurement.
    const r = refereeInsight("If he grabs, Qd7 Nxg7 follows and wins.", makeInsight(), OPTS);
    const hits = r.findings.filter((f) => f.category === "hypothetical_line_off_contract");
    expect(hits).toHaveLength(1);
    expect(hits[0].severity).toBe("warn");
    expect(hits[0].wouldPassWidenedWindow).toBe(true);
  });

  it("true PV prefix passes the strict rule", () => {
    const r = refereeInsight("Best was Ne6 Qd7 with a clean fork.", makeInsight(), OPTS);
    expect(
      r.findings.filter((f) => f.category === "hypothetical_line_off_contract"),
    ).toHaveLength(0);
  });
});

// ── Per-insight VoterSnapshot shim (plan §4 check 5) ────────────────────────
describe("buildVoterSnapshotForInsight", () => {
  it("maps degraded sources to null and confidences from the insight's voter run", () => {
    const snap = buildVoterSnapshotForInsight(makeInsight(), 1500);
    expect(snap).toMatchObject({
      confidence: {
        user_visibility: "NONE",
        positional_plan: "MED",
        mate_in_n: "NONE",
        material_win: "HIGH",
      },
      maiaProb: null,
      userRating: 1500,
      sfCp: 138,
      sfMate: null,
      lc0Cp: null,
      syzygyDtm: null,
    });
    expect(snap.positionConfidence).toEqual({ level: "engine_verified", score: 90, drivers: [] });
  });

  it("maps ok sources to their values and sentinels to null", () => {
    const insight = makeInsight({
      evalBefore: evalFact({ cp: 0, depth: 0, sentinel: true, display: "engine data unavailable" }),
      lc0: {
        status: "ok",
        value: { evalCp: 88, agreesWithSf: true },
        provenance: { source: "lc0", confidence: "engine_verified" },
      },
      visibility: {
        status: "ok",
        value: { probPlaysBest: 0.42, level: "MED" },
        provenance: { source: "maia", confidence: "heuristic" },
      },
    });
    const snap = buildVoterSnapshotForInsight(insight, null);
    expect(snap.sfCp).toBeNull();
    expect(snap.sfMate).toBeNull();
    expect(snap.lc0Cp).toBe(88);
    expect(snap.maiaProb).toBe(0.42);
    expect(snap.userRating).toBeNull();
  });
});

// ── Standing prohibition: userVisibility never escalates past warn ─────────
describe("refereeInsight — userVisibility stays warn-only (standing prohibition)", () => {
  it("dismissive language with low Maia visibility yields WARN findings only", () => {
    const insight = makeInsight({
      visibility: {
        status: "ok",
        value: { probPlaysBest: 0.05, level: "NONE" },
        provenance: { source: "maia", confidence: "heuristic" },
      },
    });
    const r = refereeInsight("Obviously you should have seen this.", insight, OPTS);
    const vis = r.findings.filter((f) => f.check === "stage9_user_visibility");
    expect(vis.length).toBeGreaterThanOrEqual(1);
    expect(vis.every((f) => f.severity === "warn")).toBe(true);
  });

  it("forbidden-claim 'obvious' with Maia unconsulted is warn severity", () => {
    // Default insight: visibility unavailable ⇒ user_visibility is a
    // forbidden claim class — but per the standing prohibition it reports
    // at warn, never error.
    const r = refereeInsight("Obviously this loses on the spot.", makeInsight(), OPTS);
    const hits = r.findings.filter(
      (f) => f.check === "forbidden_claim" && f.category === "forbidden_claim_present",
    );
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.every((f) => f.severity === "warn")).toBe(true);
  });
});

// ── Relational claims: structured-output parse, insight-anchored fen ───────
describe("refereeInsightRelational", () => {
  it("verifies claims against the insight's OWN fenBefore and flags contradictions as errors", async () => {
    let userTurnSeen = "";
    const parseCall = async ({ user }: { user: string }) => {
      userTurnSeen = user;
      // Structured-output ParserCalls return the bare-array JSON string.
      return {
        raw: JSON.stringify([
          {
            // TRUE on fenBefore: the d4 knight attacks e6.
            kind: "attack",
            pieceColor: "w",
            pieceType: "n",
            fromSquare: "d4",
            targetSquare: "e6",
            rawText: "the knight eyes e6",
          },
          {
            // FALSE on fenBefore: the d4 knight does not attack g3.
            kind: "attack",
            pieceColor: "w",
            pieceType: "n",
            fromSquare: "d4",
            targetSquare: "g3",
            rawText: "the knight controls g3",
          },
        ]),
        costUsd: 0.001,
      };
    };
    const insight = makeInsight();
    const r = await refereeInsightRelational("prose", insight, {
      correlationId: "referee-test",
      parseCall,
    });
    // The parser was anchored to the card's own position.
    expect(userTurnSeen).toContain(insight.fenBefore);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]).toMatchObject({
      check: "relational_claim",
      severity: "error",
      span: "the knight controls g3",
    });
    expect(r.costUsd).toBe(0.001);
  });

  it("pins the plan-§8 per-review Haiku parse bound", () => {
    expect(MAX_RELATIONAL_PARSES_PER_REVIEW).toBe(8);
  });
});

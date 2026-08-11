/**
 * Referee checks — MEASUREMENT-grade contract-fidelity functions (PR-CI-2).
 *
 * These are the plan-§4 checks 2/3/4/5 built as pure, side-effect-free
 * functions over (prose, InsightContract). PR-CI-2 uses them offline in
 * scripts/eval/contract_fidelity_eval.ts to commit the BEFORE baseline;
 * PR-CI-3 wires these SAME functions into serving (block-gated streaming).
 *
 * MEASUREMENT ONLY here: every function returns typed violations — nothing
 * blocks, edits, or regenerates. Severity policy, the failure ladder, and
 * the 0-false-fire arming gates are CI-3 scope (plan §4 precision
 * discipline). Where a serving validator already encodes tuned semantics
 * we import it rather than re-implementing:
 *   - checkTacticalKeywords → validateMotifGrounding (motifGrounding.ts)
 *   - checkForbiddenClaims  → POSITIONAL_TOKEN_REGEX (positionalClaim.ts),
 *     including its degraded-mode SF-decisive escape (|cp| ≥ 300 or a mate
 *     on the board passes strong positional phrasing when Lc0 is absent —
 *     without it, every "+8.0, completely winning" would be a false fire).
 *
 * Known measurement biases (documented, not silent):
 *   - The SAN/square whitelist is the plan-§4.3 set (insight-local facts).
 *     References to OTHER game moves inside an insight ("earlier you played
 *     Nf3") count as violations; the CI-3 30-game false-positive measurement
 *     decides whether the whitelist widens before error-severity arming.
 *   - user_visibility forbidden-claim detection is restricted to
 *     "obvious/obviously" — "clearly/simply/just" are too common in benign
 *     prose for measurement precision (and userVisibility checks are under a
 *     standing warn-only prohibition in serving anyway).
 */
import { Chess } from "chess.js";
import type { AnyMotif } from "@/lib/tactics/types";
import {
  netForClaimant,
  replayPvMaterial,
  type PvMaterialStep,
} from "@/lib/tactics/netMaterial";
import { ALL_TACTICAL_KEYWORDS } from "@/lib/grounding/voter";
import { validateMotifGrounding } from "@/lib/mastermind/validators/motifGrounding";
import { POSITIONAL_TOKEN_REGEX } from "@/lib/mastermind/validators/positionalClaim";
import type { ThreatNode } from "@/lib/mastermind/threatTree";
import type { ClaimClass, CoachContract, EvalFact, InsightContract } from "./types";

// ── Violation types ─────────────────────────────────────────────────────────
export type RefereeCheckName =
  | "eval_display"
  | "san_whitelist"
  | "tactical_keyword"
  | "forbidden_claim"
  // PRECISION-PACK measurement-only checks — wired into the --fp-measure
  // harness ONLY, never into runInsightChecks / refereeInsight, never armed.
  | "pv_truncation"
  | "mobility_claims";

export type RefereeViolationCategory =
  | "eval_unbacked" // signed pawn figure with no contract eval within ±0.3
  | "mate_distance_wrong" // M±n / "mate in n" with no matching contract mate
  | "san_unknown" // SAN-shaped token not derivable from the contract
  | "square_unknown" // bare square + claim verb, square not in the contract
  | "hypothetical_line_off_contract" // multi-move sequence, not a PV prefix
  | "tactical_keyword_unbacked"
  | "forbidden_claim_present"
  // Measurement-only categories (precision pack; see the check-name note).
  | "pv_truncation_suspect" // PV quote stops one ply before a recapture while asserting a favorable outcome
  | "mobility_count_wrong"; // bare-integer mobility claim contradicted by chess.js counts

export interface RefereeViolation {
  check: RefereeCheckName;
  category: RefereeViolationCategory;
  /** The offending prose span (or joined move sequence). */
  span: string;
  /** Character offset of the span in the prose (-1 when not applicable). */
  index: number;
  detail: string;
  /** Set for forbidden_claim_present violations. */
  claimClass?: ClaimClass;
  /**
   * hypothetical_line_off_contract under the STRICT prefix rule only
   * (PR-CI-3 blocking referee): true when the sequence fails the plan-§4.3
   * prefix rule but WOULD pass the measurement-widened window rule.
   * Arming telemetry for the CI-4/5 30-game false-positive decision.
   */
  wouldPassWidenedWindow?: boolean;
}

// ── Shared regexes (fresh clones per call — /g state never shared) ─────────
/** Signed pawn figure: "+1.38", "-0.42" (plan §4 check 2 — ±N.NN spans). */
const PAWN_FIGURE_RE = /[+-]\d+\.\d{1,2}\b/g;
/** Mate notation: "M+5" / "M-3" (signed, White-centric like EvalFact). */
const MATE_FIGURE_RE = /\bM([+-]\d+)\b/g;
/** Verbal mate distance: "mate in 3" (distance-only, side-agnostic). */
const MATE_IN_RE = /\bmate in (\d+)\b/gi;
/**
 * Piece-lettered / unambiguous SAN: "Nf3", "Qxb2", "O-O", "exd5", "e8=Q".
 * Bare pawn pushes ("e4") are deliberately EXCLUDED — they are ambiguous
 * with square references and go through the square+claim-verb path instead.
 */
const SAN_PIECE_RE =
  /\b(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][18]=[QRBN])[+#]?/g;
const SQUARE_RE = /\b[a-h][1-8]\b/g;
/** A token that can be a SAN move INSIDE a move sequence (incl. bare pawn pushes). */
const SEQ_MOVE_RE =
  /^(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?|[a-h]x[a-h][1-8](?:=[QRBN])?|[a-h][1-8](?:=[QRBN])?)[+#]?$/;
const MOVE_NUMBER_RE = /^\d+\.(?:\.\.)?$/;

/**
 * Claim verbs that turn a bare square mention into a board-fact claim
 * ("the rook on d3 cuts the defense" — the TTT class, plan §4 check 3).
 */
const CLAIM_VERB_RE =
  /\b(?:attack(?:s|ed|ing)?|defend(?:s|ed|ing)?|hang(?:s|ing)?|hung|pin(?:s|ned|ning)?|fork(?:s|ed|ing)?|skewer(?:s|ed|ing)?|captur(?:e|es|ed|ing)|tak(?:es|ing)|took|threat(?:en|ens|ened|ening)?|control(?:s|led|ling)?|cover(?:s|ed|ing)?|guard(?:s|ed|ing)?|trap(?:s|ped|ping)?|win(?:s|ning)?|los(?:es|ing)|block(?:s|ed|ing)?|target(?:s|ed|ing)?|cut(?:s|ting)?|eyeing|aim(?:s|ed|ing)?|undefended|unprotected|loose|en prise)\b/i;
// NOTE: bare "eye/eyes" is deliberately absent ("keep an eye on b3" is benign
// rhetoric, caught by the unit-test controls); only "eyeing" claims.

const ENDGAME_WDL_RE =
  /\btablebase\b|\btheoretical(?:ly)?\s+(?:winning|won|draw|drawn|lost|losing)\b/gi;
const USER_VISIBILITY_RE = /\bobvious(?:ly)?\b/gi;

const EVAL_TOLERANCE_PAWNS = 0.3;

function clone(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags);
}

/** Exported (PR-CI-3) — the blocking referee reuses the SAME normalization
 * (grammar-drift hazard if duplicated; see referee.ts). */
export function stripSanDecorations(san: string): string {
  return san.replace(/[+#!?]+$/g, "");
}

// ── Check 1: eval displays ──────────────────────────────────────────────────
export interface EvalPools {
  /** Pawn values (cp/100) the contract can back. */
  pawns: number[];
  /** Signed mate distances the contract can back. */
  mates: number[];
}

/** Exported (FP-30game measurement) — the harness builds contract-global
 * license pools from the same grammar; logic unchanged. */
export function collectEvalPools(insight: InsightContract): EvalPools {
  const pawns: number[] = [];
  const mates: number[] = [];
  const addFact = (f: EvalFact | null | undefined) => {
    if (!f || f.sentinel) return; // sentinel = "engine data unavailable", never a number
    if (f.mate !== null) mates.push(f.mate);
    else if (f.cp !== null) pawns.push(f.cp / 100);
  };
  addFact(insight.evalBefore);
  addFact(insight.evalAfter);
  for (const line of insight.lines) addFact(line.eval);
  // Legacy ±9999-flattened header numbers (rendered without mate distance).
  if (Math.abs(insight.cpBeforeFlat) < 9000) pawns.push(insight.cpBeforeFlat / 100);
  if (Math.abs(insight.cpAfterFlat) < 9000) pawns.push(insight.cpAfterFlat / 100);
  // The severity drop is quotable in either direction ("lost 3.5 pawns",
  // "the eval swung -3.50").
  pawns.push(insight.severityDropCp / 100, -insight.severityDropCp / 100);
  if (insight.chessdb.status === "ok") pawns.push(insight.chessdb.value.evalCp / 100);
  if (insight.lc0.status === "ok") pawns.push(insight.lc0.value.evalCp / 100);
  return { pawns, mates };
}

/**
 * PRECISION PACK fix 7 — contract-GLOBAL eval license pool. The 30-game FP
 * measurement (contract-referee-fp-30game-*.json) adjudicated BOTH
 * eval_display fires as "licensed-elsewhere-in-contract": legitimate
 * cross-insight/game references (e.g. the move-table's M-2 quoted from an
 * adjacent insight's card) that the insight-LOCAL whitelist over-fired on.
 * Union of every insight's pools + the move table's evals + bestWas lines —
 * the same facts the FP harness's mechanical adjudicator used.
 */
export function collectContractEvalPools(contract: CoachContract): EvalPools {
  const pawns: number[] = [];
  const mates: number[] = [];
  for (const ins of contract.insights) {
    const p = collectEvalPools(ins);
    pawns.push(...p.pawns);
    mates.push(...p.mates);
  }
  const addFact = (f: EvalFact | null | undefined) => {
    if (!f || f.sentinel) return;
    if (f.mate !== null) mates.push(f.mate);
    else if (f.cp !== null) pawns.push(f.cp / 100);
  };
  for (const row of contract.moveTable) {
    addFact(row.evalAfter);
    if (row.bestWas?.line) addFact(row.bestWas.line.eval);
  }
  return { pawns, mates };
}

const contractEvalPoolsCache = new WeakMap<CoachContract, EvalPools>();
function contractEvalPools(contract: CoachContract): EvalPools {
  let pools = contractEvalPoolsCache.get(contract);
  if (!pools) {
    pools = collectContractEvalPools(contract);
    contractEvalPoolsCache.set(contract, pools);
  }
  return pools;
}

/**
 * Plan §4 check 2 (measurement form): every ±N.NN span must land within
 * ±0.3 pawns of a contract eval; every M±n / "mate in n" span must match a
 * contract mate distance exactly (signed for M±n; absolute for "mate in n",
 * which does not encode a side).
 *
 * When the full CoachContract is provided the license pool is
 * contract-GLOBAL (precision-pack fix 7 — see collectContractEvalPools);
 * insight-local otherwise (older call sites, unit fixtures).
 */
export function checkEvalDisplays(
  prose: string,
  insight: InsightContract,
  contract?: CoachContract,
): RefereeViolation[] {
  const pools = contract ? contractEvalPools(contract) : collectEvalPools(insight);
  const violations: RefereeViolation[] = [];

  for (const m of Array.from(prose.matchAll(clone(PAWN_FIGURE_RE)))) {
    const value = Number.parseFloat(m[0]);
    if (!Number.isFinite(value)) continue;
    const backed = pools.pawns.some((p) => Math.abs(p - value) <= EVAL_TOLERANCE_PAWNS + 1e-9);
    if (!backed) {
      violations.push({
        check: "eval_display",
        category: "eval_unbacked",
        span: m[0],
        index: m.index ?? -1,
        detail: `eval figure ${m[0]} has no contract eval within ±${EVAL_TOLERANCE_PAWNS} pawns (contract evals: ${pools.pawns.map((p) => p.toFixed(2)).join(", ") || "none"})`,
      });
    }
  }

  for (const m of Array.from(prose.matchAll(clone(MATE_FIGURE_RE)))) {
    const dist = Number.parseInt(m[1], 10);
    if (!pools.mates.some((md) => md === dist)) {
      violations.push({
        check: "eval_display",
        category: "mate_distance_wrong",
        span: m[0],
        index: m.index ?? -1,
        detail: `mate figure ${m[0]} does not match any contract mate exactly (contract mates: ${pools.mates.join(", ") || "none"})`,
      });
    }
  }

  for (const m of Array.from(prose.matchAll(clone(MATE_IN_RE)))) {
    const dist = Number.parseInt(m[1], 10);
    if (!pools.mates.some((md) => Math.abs(md) === dist)) {
      violations.push({
        check: "eval_display",
        category: "mate_distance_wrong",
        span: m[0],
        index: m.index ?? -1,
        detail: `"${m[0]}" does not match any contract mate distance (contract mates: ${pools.mates.join(", ") || "none"})`,
      });
    }
  }

  return violations;
}

// ── Check 2: SAN / square whitelist ─────────────────────────────────────────
function motifSquares(motifs: AnyMotif[]): string[] {
  const squares: string[] = [];
  for (const m of motifs) {
    switch (m.motif) {
      case "fork":
        squares.push(m.by_square, ...m.targets.map((t) => t.square));
        break;
      case "pin":
        squares.push(m.pinner.square, m.pinned.square, m.behind.square);
        break;
      case "skewer":
        squares.push(m.skewerer.square, m.front.square, m.back.square);
        break;
      case "discovered_attack":
        squares.push(m.mover.from, m.mover.to, m.revealer.square, m.victim.square);
        if (m.double_attack_target) squares.push(m.double_attack_target.square);
        break;
      case "removed_defender":
        squares.push(m.removed.square, m.was_defending.square);
        break;
      case "hanging_piece":
        squares.push(
          m.square,
          ...m.attackers.map((a) => a.square),
          ...m.defenders.map((d) => d.square),
        );
        break;
      case "trapped_piece":
        squares.push(m.square, ...m.escape_squares_checked);
        for (const u of m.all_unsafe_because) squares.push(u.square, u.threatened_by);
        break;
      case "back_rank_mate":
      case "back_rank_threat":
        squares.push(m.delivering_square, m.king_square, ...m.interposers);
        for (const b of m.escape_squares_blocked_by) squares.push(b.square);
        break;
    }
  }
  return squares;
}

/** Exported (FP-30game measurement) — same reuse rationale as
 * collectEvalPools; logic unchanged. */
export function fenPieceSquares(fen: string): string[] {
  const squares: string[] = [];
  const placement = fen.split(" ")[0] ?? "";
  const ranks = placement.split("/");
  for (let r = 0; r < ranks.length && r < 8; r++) {
    let file = 0;
    for (const ch of ranks[r]) {
      if (/\d/.test(ch)) {
        file += Number.parseInt(ch, 10);
      } else {
        squares.push(`${"abcdefgh"[file]}${8 - r}`);
        file += 1;
      }
    }
  }
  return squares;
}

function threatSanLines(threats: ThreatNode[] | null): string[][] {
  const lines: string[][] = [];
  const walk = (node: ThreatNode, prefix: string[]) => {
    const here = [...prefix, node.threatSan];
    lines.push(here);
    for (const edge of node.defenses) {
      const withDefense = [...here, edge.defenseSan];
      lines.push(withDefense);
      if (edge.consequence) walk(edge.consequence, withDefense);
    }
  };
  for (const t of threats ?? []) walk(t, []);
  return lines;
}

function uciSquares(uci: string): string[] {
  const out: string[] = [];
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  if (/^[a-h][1-8]$/.test(from)) out.push(from);
  if (/^[a-h][1-8]$/.test(to)) out.push(to);
  return out;
}

export interface Whitelist {
  /** Normalized SAN tokens (decorations stripped) the contract can back. */
  san: Set<string>;
  /** Squares the contract can back (plan §4 check 3 set). */
  squares: Set<string>;
  /** Candidate PVs for the hypothetical-line prefix allowance (normalized). */
  pvs: string[][];
}

/**
 * ROUND 2 — a contract PV with its END eval attached (the engine's verdict
 * for the line, White-centric). Engine lines carry their LineFact eval;
 * branch-point reconstructions and threat-tree lines carry null (no engine
 * number is attached to them in the contract). One enumerator feeds BOTH
 * buildWhitelist().pvs and checkPvTruncation — one grammar, never
 * copy-pasted (same discipline as the tokenizer).
 */
export interface PvSource {
  /** Normalized SANs (decorations stripped), same filtering as the old
   * buildWhitelist addPv (falsy entries dropped BEFORE stripping). */
  sans: string[];
  evalCp: number | null;
  evalMate: number | null;
}

export function buildPvSources(insight: InsightContract): PvSource[] {
  const out: PvSource[] = [];
  const push = (line: (string | null | undefined)[], ev?: EvalFact | null) => {
    const sans = line.filter((s): s is string => !!s).map(stripSanDecorations);
    if (sans.length === 0) return;
    const usable = ev && !ev.sentinel ? ev : null;
    out.push({
      sans,
      evalCp: usable ? usable.cp : null,
      evalMate: usable ? usable.mate : null,
    });
  };
  for (const line of insight.lines) push(line.san, line.eval);
  if (insight.branchPoint) {
    push([...insight.branchPoint.sharedSan, insight.branchPoint.bestContinues]);
    push([...insight.branchPoint.sharedSan, insight.branchPoint.playedGoes]);
  }
  if (insight.intelBranchPoint) {
    push([...insight.intelBranchPoint.sharedSan, insight.intelBranchPoint.bestContinues]);
    push([...insight.intelBranchPoint.sharedSan, insight.intelBranchPoint.altContinues]);
  }
  for (const line of threatSanLines(insight.threats)) push(line);
  return out;
}

/** Exported (PR-CI-3) — one whitelist builder for measurement AND blocking. */
export function buildWhitelist(insight: InsightContract): Whitelist {
  const san = new Set<string>();
  const squares = new Set<string>();
  const pvs: string[][] = [];

  const addSan = (s: string | null | undefined) => {
    if (!s) return;
    const norm = stripSanDecorations(s);
    if (!norm) return;
    san.add(norm);
    // Squares embedded in a whitelisted move are themselves referable
    // ("the knight lands on d5" after PV ...Nd5).
    for (const sq of norm.match(clone(SQUARE_RE)) ?? []) squares.add(sq);
  };

  addSan(insight.playedSan);
  addSan(insight.bestSan);
  // PV enumeration shared with checkPvTruncation (buildPvSources) — identical
  // content and order to the pre-round-2 addPv sequence.
  for (const src of buildPvSources(insight)) {
    pvs.push(src.sans);
    for (const s of src.sans) addSan(s);
  }
  for (const line of insight.lines) {
    for (const uci of line.pvUci) for (const sq of uciSquares(uci)) squares.add(sq);
  }
  for (const t of insight.threats ?? []) {
    if (t.capturedSquare) squares.add(t.capturedSquare);
    for (const sq of uciSquares(t.threatUci)) squares.add(sq);
  }
  for (const m of insight.motifs) {
    if (m.refutation) addSan(m.refutation.move);
    if (m.motif === "removed_defender") addSan(m.follow_up_move);
  }
  for (const sq of motifSquares(insight.motifs)) squares.add(sq);
  if (insight.relational) {
    for (const c of insight.relational.captures) {
      squares.add(c.attackerSquare);
      squares.add(c.targetSquare);
    }
    for (const h of insight.relational.hanging) {
      squares.add(h.square);
      for (const sq of h.attackerSquares) squares.add(sq);
      for (const sq of h.defenderSquares) squares.add(sq);
    }
    for (const p of insight.relational.pins) {
      squares.add(p.pinnerSquare);
      squares.add(p.pinnedSquare);
      squares.add(p.behindSquare);
    }
  }
  for (const sq of fenPieceSquares(insight.fenBefore)) squares.add(sq);
  for (const sq of fenPieceSquares(insight.fenAfter)) squares.add(sq);

  return { san, squares, pvs };
}

export interface ProseToken {
  raw: string;
  norm: string;
  /** Offset of the STRIPPED token in the prose. */
  index: number;
  /** Original whitespace-delimited word span (for overlap dedup). */
  wordStart: number;
  wordEnd: number;
  kind: "piece_san" | "pawn_or_square" | "move_number" | "other";
  /**
   * PRECISION PACK fix 3: the token's trailing punctuation contained a
   * clause separator (, ; : — –). A move sequence NEVER continues past such
   * a token — attacker/threat enumerations ("Rh8, Bb7, and Nc7", "threats of
   * Qb4+, Qa5+", "Passive on h1; Rhe1 activates it") are prose lists, not
   * lines. Adjudicated FP spans #13/#15/#29 of the 30-game measurement.
   */
  endsRun: boolean;
}

/** Exported (PR-CI-3) — one tokenizer for measurement AND blocking. */
export function tokenizeProse(prose: string): ProseToken[] {
  const tokens: ProseToken[] = [];
  const wordRe = /[^\s]+/g;
  for (const m of Array.from(prose.matchAll(wordRe))) {
    const word = m[0];
    const wordStart = m.index ?? 0;
    // Strip common surrounding punctuation, keep move/SAN internals.
    const leading = word.match(/^[("'“”‘’[]+/)?.[0] ?? "";
    const stripped = word.slice(leading.length).replace(/[)"'“”‘’\],;:.!?—–]+$/, "");
    const trailing = word.slice(leading.length + stripped.length);
    const norm = stripSanDecorations(stripped);
    let kind: ProseToken["kind"] = "other";
    // Move numbers keep their trailing dot(s), so classify BEFORE the strip
    // above would matter (the strip removes trailing dots).
    if (MOVE_NUMBER_RE.test(word.slice(leading.length)) || MOVE_NUMBER_RE.test(`${stripped}.`))
      kind = "move_number";
    else if (/^[a-h][1-8]$/.test(stripped)) kind = "pawn_or_square";
    else if (SEQ_MOVE_RE.test(stripped)) kind = "piece_san";
    tokens.push({
      raw: stripped,
      norm,
      index: wordStart + leading.length,
      wordStart,
      wordEnd: wordStart + word.length,
      kind,
      endsRun: /[,;:—–]/.test(trailing),
    });
  }
  return tokens;
}

/**
 * Hypothetical-line allowance (plan §4.3), measurement widening: a prose
 * move sequence is legal iff it is a CONTIGUOUS WINDOW of some contract PV
 * (the plan text says "prefixes"; prefixes ⊂ windows). Widened deliberately
 * for the BEFORE baseline: quoting a PV mid-line ("after Bxd1, Bxf7+ Ke7
 * Nd5# follows") is routine coaching prose, and counting it as fabrication
 * would poison the measurement. CI-3 decides the serving-severity rule on
 * the 30-game false-positive set before this check ever arms at error.
 */
export function isPvWindow(seq: string[], pvs: string[][]): boolean {
  return pvs.some((pv) => {
    if (pv.length < seq.length) return false;
    for (let off = 0; off + seq.length <= pv.length; off++) {
      if (seq.every((s, i) => pv[off + i] === s)) return true;
    }
    return false;
  });
}

/**
 * The plan-§4.3 STRICT hypothetical-line rule (PR-CI-3 blocking form): a
 * prose move sequence is legal iff it is a PREFIX of some contract PV — the
 * continuation must start from the position the card is anchored to.
 * The widened window form above is kept for measurement only (BEFORE
 * baseline comparability); the blocking referee uses this one.
 */
export function isPvPrefix(seq: string[], pvs: string[][]): boolean {
  return pvs.some(
    (pv) => pv.length >= seq.length && seq.every((s, i) => pv[i] === s),
  );
}

function sentenceBounds(prose: string, index: number): { start: number; end: number } {
  // Sentence = text between terminators (.!?) or newlines.
  let start = 0;
  for (let i = index - 1; i >= 0; i--) {
    const ch = prose[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      start = i + 1;
      break;
    }
  }
  let end = prose.length;
  for (let i = index; i < prose.length; i++) {
    const ch = prose[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") {
      end = i + 1;
      break;
    }
  }
  return { start, end };
}

// ── PRECISION PACK fixes 1 + 2: designator license + legal-move normalization ─
/** Square → FEN piece char (case carries color) for a placement string. */
export function fenPieceMap(fen: string): Map<string, string> {
  const map = new Map<string, string>();
  const placement = fen.split(" ")[0] ?? "";
  const ranks = placement.split("/");
  for (let r = 0; r < ranks.length && r < 8; r++) {
    let file = 0;
    for (const ch of ranks[r]) {
      if (/\d/.test(ch)) {
        file += Number.parseInt(ch, 10);
      } else {
        map.set(`${"abcdefgh"[file]}${8 - r}`, ch);
        file += 1;
      }
    }
  }
  return map;
}

/**
 * Fix 1 — piece-designator license: a bare SAN-shaped token ("Ne5", "Rh1",
 * "Bc4") is routine coaching shorthand for "the knight ON e5" — a board
 * reference, not a move claim — whenever that piece type actually stands on
 * that square in the insight's fenBefore OR fenAfter (either color).
 * Adjudicated FP spans #23-#26 ("the Ne5"), #34 ("Rh1: undeveloped and
 * idle") and the members of #13 (Rh8/Bb7/Nc7 attacker enumeration) of the
 * 30-game measurement. Restricted to the UNDECORATED form — a trailing
 * +/#/x makes it a move/capture claim and stays under the whitelist rule.
 */
const PIECE_DESIGNATOR_RE = /^[KQRBN][a-h][1-8]$/;
function isPieceDesignatorLicensed(rawSpan: string, maps: Array<Map<string, string>>): boolean {
  if (!PIECE_DESIGNATOR_RE.test(rawSpan)) return false;
  const piece = rawSpan[0];
  const sq = rawSpan.slice(1);
  return maps.some((m) => (m.get(sq) ?? "").toUpperCase() === piece);
}

/**
 * Fix 2 — legal-move normalization: over-/under-/mis-disambiguated SAN is
 * normalized against the LEGAL MOVES of fenBefore/fenAfter before the
 * whitelist verdict. "Bc4xd5+" → Bxd5, "Qd5+" → Qxd5 (when only the
 * capture-check exists), "Re1" → Rhe1/Rae1 (ambiguous rook). The token is
 * licensed iff SOME legal-move reading of it is contract-backed.
 * Adjudicated FP spans #0, #5, #30 of the 30-game measurement.
 */
const SAN_CORE_RE = /^([KQRBN])([a-h][1-8]|[a-h]|[1-8])?(x?)([a-h][1-8])(?:=([QRBN]))?$/;

type LegalMovesCache = Map<string, Array<{ from: string; to: string; piece: string; san: string; captured: boolean; promotion: string | null }>>;

function legalMovesOf(fen: string, cache: LegalMovesCache) {
  let moves = cache.get(fen);
  if (moves === undefined) {
    try {
      moves = new Chess(fen).moves({ verbose: true }).map((m) => ({
        from: m.from,
        to: m.to,
        piece: m.piece,
        san: m.san,
        captured: !!m.captured,
        promotion: m.promotion ?? null,
      }));
    } catch {
      moves = [];
    }
    cache.set(fen, moves);
  }
  return moves;
}

/** Legal-move SANs (decorations stripped) consistent with a piece-SAN token. */
function legalNormalizations(norm: string, fens: string[], cache: LegalMovesCache): string[] {
  const m = norm.match(SAN_CORE_RE);
  if (!m) return [];
  const [, piece, disambig = "", capture, dest, promo = null] = m;
  const out = new Set<string>();
  for (const fen of fens) {
    for (const mv of legalMovesOf(fen, cache)) {
      if (mv.piece.toUpperCase() !== piece) continue;
      if (mv.to !== dest) continue;
      if ((mv.promotion ? mv.promotion.toUpperCase() : null) !== promo) continue;
      // A claimed capture must BE a capture; an unclaimed one may be either
      // ("Qd5+" where only Qxd5+ is legal is under-specification, not
      // fabrication — a fabricated capture marker is).
      if (capture === "x" && !mv.captured) continue;
      // Disambiguation, when present, must be consistent with the mover.
      if (disambig.length === 2 && mv.from !== disambig) continue;
      if (disambig.length === 1) {
        if (/[a-h]/.test(disambig) ? mv.from[0] !== disambig : mv.from[1] !== disambig) continue;
      }
      out.add(stripSanDecorations(mv.san));
    }
  }
  return Array.from(out);
}

export interface SanWhitelistOpts {
  /**
   * Hypothetical-line rule (plan §4.3):
   *  - "window" (default — MEASUREMENT-widened, keeps the BEFORE baseline
   *    comparable): sequences legal iff a contiguous window of a contract PV.
   *  - "prefix" (STRICT, the blocking referee): sequences legal iff a prefix
   *    of a contract PV; window-passing failures carry
   *    wouldPassWidenedWindow=true for the CI-4/5 arming measurement.
   */
  hypotheticalRule?: "window" | "prefix";
}

/**
 * Plan §4 check 3: every unambiguous SAN token and every bare square coupled
 * with a claim verb must be derivable from the contract. Includes the §4.3
 * hypothetical-line allowance (see isPvWindow / isPvPrefix + SanWhitelistOpts):
 * multi-move SAN sequences are legal iff backed by a contract PV under the
 * selected rule; off-contract sequences report ONE
 * `hypothetical_line_off_contract` violation (members are not double-reported
 * individually).
 */
export function checkSanWhitelist(
  prose: string,
  insight: InsightContract,
  opts: SanWhitelistOpts = {},
): RefereeViolation[] {
  const rule = opts.hypotheticalRule ?? "window";
  const wl = buildWhitelist(insight);
  const violations: RefereeViolation[] = [];
  const tokens = tokenizeProse(prose);
  const consumed = new Set<number>(); // token indices already judged in a sequence
  // Precision-pack license inputs (fixes 1 + 2): board maps + lazy legal moves.
  const pieceMaps = [fenPieceMap(insight.fenBefore), fenPieceMap(insight.fenAfter)];
  const fens = [insight.fenBefore, insight.fenAfter];
  const legalCache: LegalMovesCache = new Map();
  const sanLicensed = (rawSpan: string, norm: string): boolean => {
    if (wl.san.has(norm)) return true;
    if (isPieceDesignatorLicensed(rawSpan, pieceMaps)) return true; // fix 1
    return legalNormalizations(norm, fens, legalCache).some((s) => wl.san.has(s)); // fix 2
  };

  // ── Pass 1: move sequences (≥2 moves, move-numbers allowed between; a
  //    clause separator , ; : — – ends the run — precision-pack fix 3) ──────
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].kind === "piece_san" || tokens[i].kind === "pawn_or_square" || tokens[i].kind === "move_number") {
      const runIdx: number[] = [];
      let j = i;
      while (
        j < tokens.length &&
        (tokens[j].kind === "piece_san" ||
          tokens[j].kind === "pawn_or_square" ||
          tokens[j].kind === "move_number")
      ) {
        runIdx.push(j);
        const endsRun = tokens[j].endsRun;
        j++;
        if (endsRun) break;
      }
      const moveIdx = runIdx.filter((k) => tokens[k].kind !== "move_number");
      const hasPieceSan = moveIdx.some((k) => tokens[k].kind === "piece_san");
      // A run only counts as a MOVE SEQUENCE when it has ≥2 moves and at
      // least one unambiguous SAN ("e4 e5" alone is more likely two square
      // references than a line; precision first).
      if (moveIdx.length >= 2 && hasPieceSan) {
        const seq = moveIdx.map((k) => tokens[k].norm);
        for (const k of moveIdx) consumed.add(k);
        const legal = rule === "prefix" ? isPvPrefix(seq, wl.pvs) : isPvWindow(seq, wl.pvs);
        if (!legal) {
          violations.push({
            check: "san_whitelist",
            category: "hypothetical_line_off_contract",
            span: seq.join(" "),
            index: tokens[moveIdx[0]].index,
            detail:
              rule === "prefix"
                ? `move sequence "${seq.join(" ")}" is not a prefix of any contract PV (plan §4.3 strict hypothetical-line rule)`
                : `move sequence "${seq.join(" ")}" is not a contiguous window of any contract PV (plan §4.3 hypothetical-line rule, measurement-widened from prefix)`,
            ...(rule === "prefix"
              ? { wouldPassWidenedWindow: isPvWindow(seq, wl.pvs) }
              : {}),
          });
        }
      }
      i = j;
    } else {
      i++;
    }
  }

  // ── Pass 2: singleton unambiguous SAN tokens ─────────────────────────────
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind !== "piece_san" || consumed.has(k)) continue;
    if (!sanLicensed(t.raw, t.norm)) {
      violations.push({
        check: "san_whitelist",
        category: "san_unknown",
        span: t.raw,
        index: t.index,
        detail: `SAN token "${t.raw}" does not occur in the contract (lines/branch points/threats/motifs/played/best), names no piece standing on that square, and no legal-move normalization of it is contract-backed`,
      });
    }
  }

  // Also catch SAN embedded in non-whitespace-delimited contexts (e.g. the
  // colon-joined [INSIGHT:...] header fields "…:g5:Nf3]"). Any match that
  // overlaps a word token already judged above is skipped.
  const judgedSpans = tokens
    .filter((t) => t.kind === "piece_san")
    .map((t) => ({ start: t.wordStart, end: t.wordEnd }));
  for (const m of Array.from(prose.matchAll(clone(SAN_PIECE_RE)))) {
    const idx = m.index ?? -1;
    const end = idx + m[0].length;
    if (judgedSpans.some((s) => idx < s.end && end > s.start)) continue;
    const norm = stripSanDecorations(m[0]);
    if (!sanLicensed(m[0], norm)) {
      violations.push({
        check: "san_whitelist",
        category: "san_unknown",
        span: m[0],
        index: idx,
        detail: `SAN token "${m[0]}" does not occur in the contract (lines/branch points/threats/motifs/played/best), names no piece standing on that square, and no legal-move normalization of it is contract-backed`,
      });
    }
  }

  // ── Pass 3: bare squares coupled with a claim verb ───────────────────────
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind !== "pawn_or_square" || consumed.has(k)) continue;
    if (wl.squares.has(t.raw)) continue;
    const { start, end } = sentenceBounds(prose, t.index);
    const sentence = prose.slice(start, end);
    if (CLAIM_VERB_RE.test(sentence)) {
      violations.push({
        check: "san_whitelist",
        category: "square_unknown",
        span: t.raw,
        index: t.index,
        detail: `square "${t.raw}" appears in a claim sentence ("${sentence.trim().slice(0, 80)}…") but is not in the contract's square set`,
      });
    }
  }

  return violations;
}

// ── Check 3: tactical keywords ──────────────────────────────────────────────
/**
 * Plan §4 check 4 (measurement form): validateMotifGrounding — the shipping
 * serving validator, imported not re-implemented — run against the insight's
 * own motifs, then cross-checked against insight.allowedTacticalKeywords
 * (the voter's compiled allowance; belt and suspenders, they derive from the
 * same confirmed motifs).
 */
/**
 * PRECISION PACK fix 5 — CONCEPT-tag exemption: `[CONCEPT:...]` spans are
 * structured widget markup (client-rendered chips), not prose claims — CI-4's
 * serving ladder already strips grammar-token lines before refereeing
 * (stripGrammarTokenLines); this mirrors that in the measurement checks.
 * Adjudicated FP spans #21/#27 ("[CONCEPT:discoveredAttack:...]") of the
 * 30-game measurement. Blanked (not deleted) so indices stay stable.
 */
function scrubConceptTags(prose: string): string {
  return prose.replace(/\[CONCEPT:[^\]\n]*\]/g, (m) => " ".repeat(m.length));
}

export function checkTacticalKeywords(prose: string, insight: InsightContract): RefereeViolation[] {
  const scrubbed = scrubConceptTags(prose); // fix 5
  // PRECISION PACK fix 4 (consumer side): the license pool is the insight's
  // own played-move motifs PLUS the scope-extended motifLicense the builder
  // detects on fenAfter and the first 2 plies of each contract PV — real
  // pins/traps/fork-threats the fenBefore+playedSan scope missed
  // (adjudicated FP spans #1/#3/#6/#11/#12/#16/#22).
  const motifPool = [...insight.motifs, ...(insight.motifLicense ?? [])];
  const result = validateMotifGrounding({
    llmResponse: scrubbed,
    detectedMotifs: motifPool,
    fen: insight.fenBefore,
    moveSan: insight.playedSan,
    correlationId: `fidelity:${insight.factIdPrefix}`,
  });
  const allowed = new Set(insight.allowedTacticalKeywords.map((k) => k.toLowerCase()));
  const lower = scrubbed.toLowerCase();
  const seen = new Set<string>(); // fix 6 — dedup identical (keyword) double-fires
  return result.issues
    .map((issue) => ({
      issue,
      // The shipped validator prefixes its span with the issue code — strip
      // it back to the bare keyword.
      keyword: issue.llm_span.replace(/^tactical_claim_ungrounded:/, ""),
    }))
    .filter(({ keyword }) => !allowed.has(keyword.toLowerCase()))
    // Measurement-precision post-filter: the serving validator matches raw
    // substrings, so "developing" fires its "pin" keyword. Require the
    // keyword to START at a word boundary (suffixed forms like "pins",
    // "pinned" still count; mid-word hits don't). Real serving false-fire
    // class — worth CI-3's attention when these checks move into the ladder.
    .filter(({ keyword }) =>
      new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}`, "i").test(scrubbed),
    )
    // PRECISION PACK fix 6 — dedup: TACTICAL_CLAIM_KEYWORDS lists "fork"
    // twice, so one ungrounded "forking" produced two identical
    // (sentence, keyword) fires (adjudicated span pairs #11/#12, #31/#32,
    // #35/#36 of the 30-game measurement). Identical fires count ONCE.
    .filter(({ keyword }) => {
      const key = keyword.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ keyword }) => ({
      check: "tactical_keyword" as const,
      category: "tactical_keyword_unbacked" as const,
      span: keyword,
      index: lower.indexOf(keyword.toLowerCase()),
      detail: `tactical keyword "${keyword}" without a confirmed motif of that type in the contract`,
    }));
}

// ── Check 4: forbidden claim classes from Degraded sources ─────────────────
function forbiddenClaimClasses(insight: InsightContract): Set<ClaimClass> {
  const classes = new Set<ClaimClass>();
  const sources = [insight.chessdb, insight.syzygy, insight.lc0, insight.visibility] as const;
  for (const src of sources) {
    if (src.status === "unavailable") {
      for (const c of src.claimClassesForbidden) classes.add(c);
    }
  }
  return classes;
}

/**
 * Plan §4 check 5 input (measurement form): claimClassesForbidden from
 * Degraded sources → keyword classes that must not appear. Detectors:
 *   - positional_plan → POSITIONAL_TOKEN_REGEX (imported from the serving
 *     validator), WITH its degraded-mode escape: SF alone decisive
 *     (|cp| ≥ 300 or a mate on the board) passes — mirrors
 *     validatePositionalClaim's lc0-unavailable behavior.
 *   - endgame_wdl → tablebase/theoretical-outcome phrasings.
 *   - user_visibility → "obvious/obviously" (conservative subset; see
 *     module doc).
 * Other classes (tactical_motif, eval_numeric, …) are covered by the
 * dedicated checks above and not double-reported here.
 */
export function checkForbiddenClaims(prose: string, insight: InsightContract): RefereeViolation[] {
  const forbidden = forbiddenClaimClasses(insight);
  const violations: RefereeViolation[] = [];

  if (forbidden.has("positional_plan")) {
    const cp = insight.evalBefore.sentinel ? null : insight.evalBefore.cp;
    const mate = insight.evalBefore.sentinel ? null : insight.evalBefore.mate;
    const sfDecisive = (cp !== null && Math.abs(cp) >= 300) || mate !== null;
    if (!sfDecisive) {
      for (const m of Array.from(prose.matchAll(clone(POSITIONAL_TOKEN_REGEX)))) {
        violations.push({
          check: "forbidden_claim",
          category: "forbidden_claim_present",
          claimClass: "positional_plan",
          span: m[0],
          index: m.index ?? -1,
          detail: `strong positional claim "${m[0]}" while positional_plan is forbidden (Lc0 unavailable) and SF is not decisive (cp=${cp ?? "null"})`,
        });
      }
    }
  }

  if (forbidden.has("endgame_wdl")) {
    for (const m of Array.from(prose.matchAll(clone(ENDGAME_WDL_RE)))) {
      violations.push({
        check: "forbidden_claim",
        category: "forbidden_claim_present",
        claimClass: "endgame_wdl",
        span: m[0],
        index: m.index ?? -1,
        detail: `endgame-outcome claim "${m[0]}" while endgame_wdl is forbidden (no tablebase source on this path)`,
      });
    }
  }

  if (forbidden.has("user_visibility")) {
    for (const m of Array.from(prose.matchAll(clone(USER_VISIBILITY_RE)))) {
      violations.push({
        check: "forbidden_claim",
        category: "forbidden_claim_present",
        claimClass: "user_visibility",
        span: m[0],
        index: m.index ?? -1,
        detail: `"${m[0]}" while user_visibility is forbidden (Maia not consulted for this insight)`,
      });
    }
  }

  return violations;
}

// ── Convenience: all checks over one insight ────────────────────────────────
/** `contract`, when provided, widens the eval_display license pool to
 * contract-global facts (precision-pack fix 7). */
export function runInsightChecks(
  prose: string,
  insight: InsightContract,
  contract?: CoachContract,
): RefereeViolation[] {
  return [
    ...checkEvalDisplays(prose, insight, contract),
    ...checkSanWhitelist(prose, insight),
    ...checkTacticalKeywords(prose, insight),
    ...checkForbiddenClaims(prose, insight),
  ];
}

// ── Aggregation ─────────────────────────────────────────────────────────────
export interface FidelityEntry {
  insight: InsightContract;
  prose: string;
}

export interface FidelityReport {
  contractId: string;
  insightsChecked: number;
  /** Sentences containing at least one chess claim (denominator). */
  claimSentences: number;
  fabricationCount: number;
  /** Violations per 100 claim sentences (0 when no claim sentences). */
  fabricationRate: number;
  violationsByCheck: Record<RefereeCheckName, number>;
  violationsByCategory: Record<RefereeViolationCategory, number>;
  evalViolations: RefereeViolation[];
  sanViolations: RefereeViolation[];
  allViolations: Array<RefereeViolation & { factIdPrefix: string }>;
}

/** A sentence "claims" when it carries a SAN token, square, eval figure,
 * mate phrasing, tactical keyword, or strong positional token. */
export function isClaimSentence(sentence: string): boolean {
  if (!sentence.trim()) return false;
  if (clone(SAN_PIECE_RE).test(sentence)) return true;
  if (clone(SQUARE_RE).test(sentence)) return true;
  if (clone(PAWN_FIGURE_RE).test(sentence)) return true;
  if (clone(MATE_FIGURE_RE).test(sentence)) return true;
  if (clone(MATE_IN_RE).test(sentence)) return true;
  if (clone(POSITIONAL_TOKEN_REGEX).test(sentence)) return true;
  const lower = sentence.toLowerCase();
  if (ALL_TACTICAL_KEYWORDS.some((k) => lower.includes(k))) return true;
  return false;
}

export function countClaimSentences(prose: string): number {
  return prose
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => isClaimSentence(s)).length;
}

// NOTE: the measurement-only precision-pack checks (pv_truncation /
// mobility_claims) are deliberately absent — they never run through
// runInsightChecks/aggregateFidelity, only through the --fp-measure harness.
const CHECK_NAMES: RefereeCheckName[] = [
  "eval_display",
  "san_whitelist",
  "tactical_keyword",
  "forbidden_claim",
];
const CATEGORY_NAMES: RefereeViolationCategory[] = [
  "eval_unbacked",
  "mate_distance_wrong",
  "san_unknown",
  "square_unknown",
  "hypothetical_line_off_contract",
  "tactical_keyword_unbacked",
  "forbidden_claim_present",
];

/**
 * Per-review fidelity aggregate: fabricationRate = violations per 100
 * claim-sentences across the prose mapped to each insight.
 */
export function aggregateFidelity(entries: FidelityEntry[], contract: CoachContract): FidelityReport {
  const violationsByCheck = Object.fromEntries(CHECK_NAMES.map((c) => [c, 0])) as Record<
    RefereeCheckName,
    number
  >;
  const violationsByCategory = Object.fromEntries(CATEGORY_NAMES.map((c) => [c, 0])) as Record<
    RefereeViolationCategory,
    number
  >;
  const allViolations: FidelityReport["allViolations"] = [];
  let claimSentences = 0;

  for (const { insight, prose } of entries) {
    claimSentences += countClaimSentences(prose);
    for (const v of runInsightChecks(prose, insight, contract)) {
      violationsByCheck[v.check] += 1;
      violationsByCategory[v.category] += 1;
      allViolations.push({ ...v, factIdPrefix: insight.factIdPrefix });
    }
  }

  const fabricationCount = allViolations.length;
  return {
    contractId: contract.contractId,
    insightsChecked: entries.length,
    claimSentences,
    fabricationCount,
    fabricationRate: claimSentences > 0 ? (fabricationCount / claimSentences) * 100 : 0,
    violationsByCheck,
    violationsByCategory,
    evalViolations: allViolations.filter((v) => v.check === "eval_display"),
    sanViolations: allViolations.filter((v) => v.check === "san_whitelist"),
    allViolations,
  };
}

// ── PRECISION PACK measurement-only checks (fixes 9 + 10) ───────────────────
// NEVER armed, NEVER part of runInsightChecks/refereeInsight: these two run
// exclusively inside the --fp-measure harness (contract_fidelity_eval.ts) to
// gather fire-rate evidence before any arming conversation. Plan §9 risk 3
// discipline: every new check gets a 0-false-fire control gate + a measured
// FP rate before it can even be PROPOSED for the serving table.

/** Favorable-outcome assertion ("you've won material", "wins the exchange"). */
const FAVORABLE_OUTCOME_RE =
  /\b(?:you(?:'ve|’ve| have)?\s+(?:won|win)|wins?|winning|won)\b[^.!?\n]{0,60}?\b(?:material|the exchange|an exchange|a piece|the piece|a pawn|the pawn|the queen|the rook|the bishop|the knight)\b/i;

/** End-of-line eval contradiction threshold (founder rule: ±1.5 pawns). */
const PV_OUTCOME_CONTRA_CP = 150;

/**
 * Fix 9, ROUND-2 REWRITE (the founder's material-quiescence rule,
 * 2026-08-10): prose that quotes a contract PV window and stops one ply
 * before an OPPONENT capture, while asserting a favorable outcome, fires
 * ONLY when
 *  (i)  material quiescence is violated — the truncating capture takes back
 *       equal-or-greater value than the claimant banked inside the quoted
 *       window (chess.js replay, standard piece values — netMaterial.ts), OR
 *  (ii) the outcome claim contradicts the line's END eval from the
 *       claimant's perspective (≤ −1.5 pawns, or a mate against the
 *       claimant; engine lines only — branch/threat reconstructions carry no
 *       eval and are judged by (i) alone).
 *
 * The v2 adjudication drove both arms: 13 FPs were lesser-value give-backs
 * after queen harvests (net +2..+12 banked, end evals +4..+8 agreeing) —
 * they must NOT fire; the one TF (09/s2/M1 "dxe5 … winning a piece cleanly"
 * → Qxg4 takes the bishop straight back, net 0, end +1.89 for the opponent)
 * violates BOTH arms and must fire. Round-1's span #28 class (praised piece
 * captured later with net ≤ 0) keeps firing via arm (i).
 *
 * Claimant = the mover of the FIRST quoted ply. A truncating capture by the
 * claimant themselves is never a violation (it extends the harvest), and an
 * unreplayable PV ply makes the match unverifiable — skipped, never fired
 * on (precision first).
 */
export function checkPvTruncation(prose: string, insight: InsightContract): RefereeViolation[] {
  const sources = buildPvSources(insight);
  if (sources.length === 0) return [];
  const tokens = tokenizeProse(prose);
  const violations: RefereeViolation[] = [];
  const reported = new Set<string>();
  const replayCache = new Map<PvSource, PvMaterialStep[]>();
  const stepsFor = (src: PvSource): PvMaterialStep[] => {
    let steps = replayCache.get(src);
    if (!steps) {
      steps = replayPvMaterial(insight.fenBefore, src.sans);
      replayCache.set(src, steps);
    }
    return steps;
  };

  // Collect quoted move runs (same run grammar as the whitelist pass,
  // including the fix-3 clause-separator break).
  let i = 0;
  while (i < tokens.length) {
    const kindOk = (k: ProseToken["kind"]) =>
      k === "piece_san" || k === "pawn_or_square" || k === "move_number";
    if (!kindOk(tokens[i].kind)) {
      i++;
      continue;
    }
    const runIdx: number[] = [];
    let j = i;
    while (j < tokens.length && kindOk(tokens[j].kind)) {
      runIdx.push(j);
      const endsRun = tokens[j].endsRun;
      j++;
      if (endsRun) break;
    }
    const moveIdx = runIdx.filter((k) => tokens[k].kind !== "move_number");
    const hasPieceSan = moveIdx.some((k) => tokens[k].kind === "piece_san");
    if (moveIdx.length >= 1 && hasPieceSan) {
      const seq = moveIdx.map((k) => tokens[k].norm);
      const lastTok = tokens[moveIdx[moveIdx.length - 1]];
      const { start, end } = sentenceBounds(prose, lastTok.index);
      const sentence = prose.slice(start, end);
      if (FAVORABLE_OUTCOME_RE.test(sentence)) {
        let verdict: string | null = null;
        for (const src of sources) {
          if (verdict) break;
          for (let off = 0; off + seq.length <= src.sans.length; off++) {
            if (!seq.every((s, k) => src.sans[off + k] === s)) continue;
            const e = off + seq.length - 1;
            if (e + 1 >= src.sans.length) continue; // full-tail quote — nothing truncated
            const steps = stepsFor(src);
            if (steps.length < e + 2) continue; // unreplayable ply — unverifiable, never fire
            const claimant = steps[off].mover;
            const next = steps[e + 1];
            if (next.capturedValue === 0) continue; // quiet continuation
            if (next.mover === claimant) continue; // claimant's own follow-up capture
            const banked = netForClaimant(steps, claimant, off, e);
            const quiescenceViolated = next.capturedValue >= banked;
            let endContradicts = false;
            let endNote = "";
            if (src.evalMate !== null) {
              const mateForClaimant = claimant === "w" ? src.evalMate : -src.evalMate;
              endContradicts = mateForClaimant < 0;
              endNote = `line end eval M${src.evalMate > 0 ? "+" : ""}${src.evalMate} (claimant ${claimant})`;
            } else if (src.evalCp !== null) {
              const cpForClaimant = claimant === "w" ? src.evalCp : -src.evalCp;
              endContradicts = cpForClaimant <= -PV_OUTCOME_CONTRA_CP;
              endNote = `line end eval ${(src.evalCp / 100).toFixed(2)} → ${(cpForClaimant / 100).toFixed(2)} for the claimant`;
            }
            if (quiescenceViolated || endContradicts) {
              verdict =
                `quoted line "${seq.join(" ")}" stops one ply before ${next.san} in the contract PV while asserting a favorable outcome ("${sentence.trim().slice(0, 100)}…") — ` +
                (quiescenceViolated
                  ? `material quiescence violated: ${next.san} takes back ${next.capturedValue} vs ${banked} banked in the window`
                  : `outcome contradicts the ${endNote}`);
              break;
            }
          }
        }
        if (verdict) {
          const key = `${seq.join(" ")}@${lastTok.index}`;
          if (!reported.has(key)) {
            reported.add(key);
            violations.push({
              check: "pv_truncation",
              category: "pv_truncation_suspect",
              span: seq.join(" "),
              index: tokens[moveIdx[0]].index,
              detail: verdict,
            });
          }
        }
      }
    }
    i = j;
  }
  return violations;
}

/** "15 legal moves" / "15 active squares" style bare-integer mobility claims. */
const MOBILITY_CLAIM_RE = /\b(\d{1,2})\s+(?:legal moves?|active squares?|available (?:moves?|squares?)|squares? of activity)\b/gi;
/** Piece references: "queen on f3" / "knight at d4" / designator "Qf3". */
const PIECE_ON_SQUARE_RE = /\b(queen|rook|bishop|knight|king|pawn)\s+(?:on|at)\s+([a-h][1-8])\b/i;
const PIECE_DESIGNATOR_IN_SENTENCE_RE = /\b([KQRBN])([a-h][1-8])\b/;
const PIECE_NAME_TO_LETTER: Record<string, string> = {
  king: "k",
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  pawn: "p",
};

/** Legal-move count for the piece on `square`, turn-corrected. null = not
 * computable (no piece there / illegal position after the turn flip). */
function mobilityCount(fen: string, square: string, pieceLetter: string): number | null {
  try {
    const parts = fen.split(" ");
    const map = fenPieceMap(fen);
    const onBoard = map.get(square);
    if (!onBoard || onBoard.toLowerCase() !== pieceLetter) return null;
    const color = onBoard === onBoard.toUpperCase() ? "w" : "b";
    if (parts[1] !== color) {
      parts[1] = color;
      parts[3] = "-"; // en passant is stale after a turn flip
    }
    const game = new Chess(parts.join(" "));
    return game.moves({ square: square as never }).length;
  } catch {
    return null;
  }
}

/**
 * Fix 10 — mobility_claims: bare-integer mobility/square-count claims
 * verified against chess.js counts from the insight FENs. The adjudicated
 * class: fixture 01's thrice-repeated "queen on f3 … 15 active squares /
 * 15 legal moves" (spans #2/#4/#7 context) — a concrete number the board
 * contradicts. Fires ONLY when a piece+square reference is resolvable in
 * the same sentence and the claimed count matches NEITHER fenBefore nor
 * fenAfter; unverifiable claims are skipped (precision first).
 */
export function checkMobilityClaims(prose: string, insight: InsightContract): RefereeViolation[] {
  const violations: RefereeViolation[] = [];
  for (const m of Array.from(prose.matchAll(clone(MOBILITY_CLAIM_RE)))) {
    const claimed = Number.parseInt(m[1], 10);
    if (!Number.isFinite(claimed)) continue;
    const idx = m.index ?? 0;
    const { start, end } = sentenceBounds(prose, idx);
    const sentence = prose.slice(start, end);
    let pieceLetter: string | null = null;
    let square: string | null = null;
    const named = sentence.match(PIECE_ON_SQUARE_RE);
    if (named) {
      pieceLetter = PIECE_NAME_TO_LETTER[named[1].toLowerCase()] ?? null;
      square = named[2];
    } else {
      const desig = sentence.match(PIECE_DESIGNATOR_IN_SENTENCE_RE);
      if (desig) {
        pieceLetter = desig[1].toLowerCase();
        square = desig[2];
      }
    }
    if (!pieceLetter || !square) continue; // unverifiable — skip, never guess
    const counts = [insight.fenBefore, insight.fenAfter]
      .map((fen) => mobilityCount(fen, square!, pieceLetter!))
      .filter((c): c is number => c !== null);
    if (counts.length === 0) continue; // piece not on that square in either FEN
    if (counts.some((c) => c === claimed)) continue; // board backs the number
    violations.push({
      check: "mobility_claims",
      category: "mobility_count_wrong",
      span: m[0],
      index: idx,
      detail: `mobility claim "${m[0]}" for the ${pieceLetter.toUpperCase()} on ${square} contradicts chess.js (actual: ${counts.join("/")} legal move(s) in fenBefore/fenAfter)`,
    });
  }
  return violations;
}

/** The --fp-measure harness's entry for the measurement-only checks. */
export function runMeasurementOnlyChecks(
  prose: string,
  insight: InsightContract,
): RefereeViolation[] {
  return [...checkPvTruncation(prose, insight), ...checkMobilityClaims(prose, insight)];
}

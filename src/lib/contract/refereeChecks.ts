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
import { countSafeMoves } from "@/lib/tactics/motifs/trapped_piece";
import { rawAttacks } from "@/lib/tactics/utils";
import { ALL_TACTICAL_KEYWORDS } from "@/lib/grounding/voter";
import { validateMotifGrounding } from "@/lib/mastermind/validators/motifGrounding";
import { POSITIONAL_TOKEN_REGEX } from "@/lib/mastermind/validators/positionalClaim";
import type { ThreatNode } from "@/lib/mastermind/threatTree";
import { sentenceBoundsAt, splitProseSentences } from "./sentences";
import type { ClaimClass, CoachContract, EvalFact, InsightContract } from "./types";
import type { PlyStory, StoryFact } from "./lineStory";

// ── Violation types ─────────────────────────────────────────────────────────
export type RefereeCheckName =
  | "eval_display"
  | "san_whitelist"
  | "tactical_keyword"
  | "forbidden_claim"
  // FOLLOW-UP fix D: the LITERAL mobility family runs on the serving path and
  // is armed at error; the QUALITATIVE family stays measurement-only. Both
  // report under this one check name (see checkMobilityLiteralClaims /
  // checkMobilityQualitativeClaims) — only the literal one is ever reachable
  // from runInsightChecks / refereeInsight.
  | "mobility_claims"
  // MEASUREMENT-ONLY — wired into the --fp-measure harness ONLY, never into
  // runInsightChecks / refereeInsight, never armed.
  | "pv_truncation";

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
  /** null is legal ONLY with a contract — the zero-card overview referee has
   * no insight to anchor to and uses the contract-global pool exclusively. */
  insight: InsightContract | null,
  contract?: CoachContract,
): RefereeViolation[] {
  const pools = contract
    ? contractEvalPools(contract)
    : collectEvalPools(insight as InsightContract);
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
  let cached = insightWhitelistCache.get(insight);
  if (!cached) {
    cached = buildWhitelistUncached(insight);
    insightWhitelistCache.set(insight, cached);
  }
  return cached;
}

const insightWhitelistCache = new WeakMap<InsightContract, Whitelist>();

function buildWhitelistUncached(insight: InsightContract): Whitelist {
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

// ── Line-story licensing (verbalizer 4.1) ───────────────────────────────────
/**
 * Does a tactical keyword in `sentence` rest on a line-story fact the sentence
 * itself cites? The story of a line (lineStory.ts) can legitimately say
 * "trapped" or "fork" about a ply six moves down an engine line — facts that
 * must NOT license the word anywhere in the card (that is why story motifs
 * stay out of motifLicense). So the license is sentence-scoped: the sentence
 * carries [F:<P>.pv<k>.s<j>] (or [F:<P>.game.s<j>]) and THAT ply's facts back
 * the word; a whole-line citation ([F:<P>.pv<k>] / [F:<P>.game]) is accepted
 * when any ply of that line backs it.
 */
function storyPliesCited(sentence: string, insight: InsightContract): PlyStory[] {
  const out: PlyStory[] = [];
  const prefix = `${insight.factIdPrefix}.`;
  for (const m of Array.from(sentence.matchAll(/\[F:([A-Za-z0-9_.-]{1,40})\]/g))) {
    const id = m[1];
    if (!id.startsWith(prefix)) continue;
    const suffix = id.slice(prefix.length);
    const pv = /^pv(\d{1,2})(?:\.s(\d{1,2}))?$/.exec(suffix);
    const game = /^game(?:\.s(\d{1,2}))?$/.exec(suffix);
    const story = pv ? insight.lines[Number(pv[1])]?.story : game ? insight.gameStory : undefined;
    if (!story) continue;
    const ply = pv ? pv[2] : game ? game[1] : undefined;
    if (ply === undefined) out.push(...story.plies);
    else if (story.plies[Number(ply)]) out.push(story.plies[Number(ply)]);
  }
  return out;
}

function storyFactBacksKeyword(fact: StoryFact, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  const motif = fact.kind === "motif" ? fact.motif.motif : null;
  switch (kw) {
    case "fork":
    case "double attack":
      return motif === "fork";
    case "pin":
      return motif === "pin";
    case "skewer":
      return motif === "skewer";
    case "discovered":
    case "discovery":
    case "discovered attack":
      return motif === "discovered_attack";
    case "removes the defender":
      return motif === "removed_defender";
    case "trapped":
      return motif === "trapped_piece" || fact.kind === "leaves_trapped";
    case "hanging":
      return fact.kind === "en_prise" || (fact.kind === "attacks" && !fact.defended) || motif === "hanging_piece";
    case "back rank":
    case "back-rank":
      return motif === "back_rank_mate" || motif === "back_rank_threat";
    case "mate threat":
      return fact.kind === "threatens_mate" || motif === "back_rank_threat";
    default:
      return false;
  }
}

export function storyLicensesKeyword(keyword: string, sentence: string, insight: InsightContract): boolean {
  return storyPliesCited(sentence, insight).some((ply) => ply.facts.some((f) => storyFactBacksKeyword(f, keyword)));
}

/** SAN-embedded squares, no word boundaries ("Nf3" → f3). SQUARE_RE's \b
 * anchors do NOT fire inside a piece-lettered SAN. */
const SAN_EMBEDDED_SQUARE_RE = /[a-h][1-8]/g;

/**
 * FOLLOW-UP PACK fix A — contract-GLOBAL SAN/square license pool.
 *
 * v3 evidence (contract-referee-fp-30game-v3-*.json, 30 reviews): 44 strict /
 * 15 widened san_whitelist fires, and the harness adjudicated 100% of them as
 * `widened-licensed` or `licensed-elsewhere-in-contract` — i.e. every single
 * fire was mechanically backed by facts the SAME contract carries, just not by
 * the insight the prose block was mapped to. The prose is right; the
 * insight-LOCAL pool (plan §4.3) was the bug, exactly as the eval_display pool
 * was in precision-pack fix 7.
 *
 * This mirrors the harness's own buildFpPools() pool construction so the
 * serving check and the measurement adjudicator can never drift:
 *   - every insight's buildWhitelist (san + squares + PVs),
 *   - the actual game moves (SANs, their embedded squares, and the move list
 *     itself as a quotable line — the harness's "game-history-recap" license),
 *   - each move-table row's fenBefore/fenAfter piece squares,
 *   - each row's bestWas move and its PV.
 *
 * It is a strict WIDENING: it only ever adds licenses, so no true fabrication
 * that fired insight-locally can start passing unless the contract itself
 * backs the span. v2 TF #29 ("g6 cuts off its retreat square on h5" — false,
 * Bh5 is legal and uncovered) is the pinned control: h5 is absent from
 * fixture 09's contract-global square pool too, so it keeps firing.
 */
export function collectContractWhitelist(contract: CoachContract): Whitelist {
  const san = new Set<string>();
  const squares = new Set<string>();
  const pvs: string[][] = [];
  const addSanToken = (raw: string | null | undefined) => {
    if (!raw) return;
    const s = stripSanDecorations(raw);
    if (!s) return;
    san.add(s);
    for (const sq of s.match(clone(SAN_EMBEDDED_SQUARE_RE)) ?? []) squares.add(sq);
  };

  for (const ins of contract.insights) {
    const wl = buildWhitelist(ins);
    wl.san.forEach((s) => san.add(s));
    wl.squares.forEach((sq) => squares.add(sq));
    pvs.push(...wl.pvs);
  }

  const gameMoves = contract.game.moveHistory.map(stripSanDecorations).filter(Boolean);
  for (const m of gameMoves) addSanToken(m);
  if (gameMoves.length > 0) pvs.push(gameMoves);

  for (const row of contract.moveTable) {
    for (const fen of [row.fenBefore, row.fenAfter]) {
      if (fen) for (const sq of fenPieceSquares(fen)) squares.add(sq);
    }
    if (row.bestWas) {
      addSanToken(row.bestWas.san);
      const line = (row.bestWas.line?.san ?? []).map(stripSanDecorations).filter(Boolean);
      if (line.length > 0) {
        pvs.push(line);
        for (const s of line) addSanToken(s);
      }
    }
  }

  return { san, squares, pvs };
}

const contractWhitelistCache = new WeakMap<CoachContract, Whitelist>();
function contractWhitelist(contract: CoachContract): Whitelist {
  let wl = contractWhitelistCache.get(contract);
  if (!wl) {
    wl = collectContractWhitelist(contract);
    contractWhitelistCache.set(contract, wl);
  }
  return wl;
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

/**
 * Sentence bounds for the sentence-coupled checks.
 *
 * This USED to be a local scan that terminated on any bare `.`, which made
 * every chess move number ("9. Bd2") and every eval decimal ("+0.50") a
 * sentence boundary — the false-fire source flagged when the chess-aware
 * splitter landed for citations + the ladder. It now delegates to that same
 * splitter's bounds form so the referee, the citation coverage denominator and
 * the ladder's sentence-drop all agree on what a sentence is. Do not fork it
 * again.
 */
const sentenceBounds = sentenceBoundsAt;

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
  /**
   * FOLLOW-UP PACK fix A: when provided, SAN/square/PV licensing runs against
   * contract-GLOBAL facts (collectContractWhitelist) instead of the
   * insight-local pool — the v3 measurement adjudicated 59/59 san_whitelist
   * fires as licensed by exactly those facts. Position-specific licenses
   * (piece designators, legal-move normalization, plan-intent legality,
   * sentence-coupled attack maps) stay INSIGHT-local by construction: they are
   * statements about this card's board, not about the contract.
   */
  contract?: CoachContract;
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
  const localWl = buildWhitelist(insight);
  // Licence pool: contract-global when a contract is threaded (fix A), else
  // the historical insight-local pool.
  const wl = opts.contract ? contractWhitelist(opts.contract) : localWl;
  const violations: RefereeViolation[] = [];
  const tokens = tokenizeProse(prose);
  const consumed = new Set<number>(); // token indices already judged in a sequence
  // Precision-pack license inputs (fixes 1 + 2): board maps + lazy legal moves.
  const pieceMaps = [fenPieceMap(insight.fenBefore), fenPieceMap(insight.fenAfter)];
  const fens = [insight.fenBefore, insight.fenAfter];
  // ROUND 2 fix 5b — plan-intent legality pool: BOTH colors' legal moves
  // from fenBefore/fenAfter (turn-flipped clones; illegal flips skipped).
  // "You wanted the g6-Bg7 setup" names a legal-but-untaken move — a plan,
  // not a board fabrication (v2 #32 Bg7; also Nxf7/Qxd1 narrations of moves
  // the game actually reached). SAN tokens only — squares NEVER enter the
  // claim-square pool this way, so v2 TF #29 ("g6 cuts off h5", refuted by
  // the legal, uncovered Bh5) still fires.
  const planIntentFens = [...fens];
  for (const fen of fens) {
    const parts = fen.split(" ");
    parts[1] = parts[1] === "w" ? "b" : "w";
    parts[3] = "-"; // en passant is stale after a turn flip
    planIntentFens.push(parts.join(" "));
  }
  const legalCache: LegalMovesCache = new Map();
  const sanLicensed = (rawSpan: string, norm: string): boolean => {
    if (wl.san.has(norm)) return true;
    if (isPieceDesignatorLicensed(rawSpan, pieceMaps)) return true; // fix 1
    if (legalNormalizations(norm, fens, legalCache).some((s) => wl.san.has(s))) return true; // fix 2
    return legalNormalizations(norm, planIntentFens, legalCache).length > 0; // fix 5b
  };
  // ROUND 2 fix 5a — attack-map square licensing, sentence-coupled: a square
  // in a claim sentence is licensed when the SAME SENTENCE names a non-pawn
  // PV move whose piece, standing on its replayed destination, attacks that
  // square (v2 #7: "O-O Nf5 … eyeing e3" — the knight on f5 attacks e3).
  // Restricted to PV-move tokens (piece designators and the bare played move
  // never qualify) and non-pawn movers, so v2 TF #29's h5 — attacked only by
  // fenBefore pieces (Bg4) and pawns — stays unlicensed.
  let pvMoveAttacks: Map<string, Set<string>> | null = null;
  const buildPvMoveAttacks = (): Map<string, Set<string>> => {
    if (pvMoveAttacks) return pvMoveAttacks;
    pvMoveAttacks = new Map();
    // INSIGHT-local PVs only: the attack map replays from THIS insight's
    // fenBefore, so another insight's line has no meaning here (fix A keeps
    // position-specific licensing insight-local).
    for (const pv of localWl.pvs) {
      let game: Chess;
      try {
        game = new Chess(insight.fenBefore);
      } catch {
        continue;
      }
      for (const san of pv) {
        let mv: ReturnType<Chess["move"]>;
        try {
          mv = game.move(san);
        } catch {
          break;
        }
        if (!mv) break;
        if (mv.piece === "p") continue; // pawn attack maps never license (see #29)
        let set = pvMoveAttacks.get(san);
        if (!set) {
          set = new Set();
          pvMoveAttacks.set(san, set);
        }
        for (const sq of rawAttacks(game, mv.to as never)) set.add(sq);
      }
    }
    return pvMoveAttacks;
  };
  const squareLicensedByAttackMap = (square: string, sentStart: number, sentEnd: number): boolean => {
    const attacks = buildPvMoveAttacks();
    if (attacks.size === 0) return false;
    for (const t of tokens) {
      if (t.kind !== "piece_san") continue;
      if (t.index < sentStart || t.index >= sentEnd) continue;
      if (attacks.get(t.norm)?.has(square)) return true;
    }
    return false;
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
      if (squareLicensedByAttackMap(t.raw, start, end)) continue; // round-2 fix 5a
      violations.push({
        check: "san_whitelist",
        category: "square_unknown",
        span: t.raw,
        index: t.index,
        detail: `square "${t.raw}" appears in a claim sentence ("${sentence.trim().slice(0, 80)}…") but is not in the contract's square set, and no PV move named in the sentence attacks it`,
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

/** Piece-name-on-square reference ("queen on f3", "knight to e7"). */
const PIECE_NAME_ON_SQUARE_RE = /\b(?:queen|rook|bishop|knight|king|pawn)\s+(?:on|at|to)\s+[a-h][1-8]\b/i;

/**
 * ROUND 2 fix 3 — definitional-sentence test: a sentence with NO square
 * token, NO SAN token, and NO piece-on-square reference is teaching a
 * CONCEPT, not claiming a board fact ("When you move one piece and it
 * reveals an attack…, that's a discovered attack" — v2 span #13). Tactical
 * keywords in such sentences are exempt.
 */
export function isDefinitionalSentence(sentence: string): boolean {
  if (clone(SQUARE_RE).test(sentence)) return false;
  if (clone(SAN_PIECE_RE).test(sentence)) return false;
  if (PIECE_NAME_ON_SQUARE_RE.test(sentence)) return false;
  return true;
}

/** Does the contract know a mate? Insight-local PVs/played/best plus (when
 * the full contract is provided) the actual game moves. chess.js-notated
 * mates only — a "#" suffix — no judgment involved. */
function contractHasMate(insight: InsightContract, contract?: CoachContract): boolean {
  const hasHash = (s: string | null | undefined) => !!s && s.includes("#");
  if (hasHash(insight.playedSan) || hasHash(insight.bestSan)) return true;
  // NOTE: raw line sans (not buildPvSources) — decoration stripping would
  // erase the "#" this check looks for.
  for (const line of insight.lines) if (line.san.some(hasHash)) return true;
  for (const t of insight.threats ?? []) if (hasHash(t.threatSan)) return true;
  if (contract) {
    if (contract.game.moveHistory.some(hasHash)) return true;
    if (contract.game.resultText === "Checkmate") return true;
  }
  return false;
}

/**
 * The TRAPPED class of tactical keywords — the ones whose truth condition is
 * "this piece has no safe square to go to", which `countSafeMoves` decides
 * arithmetically. Every other TACTICAL_CLAIM_KEYWORDS entry (fork, pin,
 * skewer, …) asserts a relationship the motif detectors own, and keeps its
 * detector-only license.
 */
const TRAPPED_CLASS_KEYWORDS = new Set(["trapped"]);

/**
 * CI-5 FOLLOW-UP (2026-08-11) — board-truth license for the TRAPPED class.
 *
 * The CI-5 gate run failed its false-intervention bar 2/10, and BOTH false
 * fires were the word "trapped" on a piece whose flight squares were all
 * covered: prose the board agreed with, refuted because `detectMotifs` had
 * not put "trapped" in THAT insight's `allowedTacticalKeywords` (it was in a
 * neighbouring insight's). Plan §9 risk 2 — detector RECALL — arriving where
 * it was predicted, and the two structural reasons it under-recalls are:
 *
 *   1. `detectTrappedPieces`/`detectImmobilizedPieces` only ever scan the
 *      OPPONENT's pieces (`sq.color !== opponentColor` → skip). A player who
 *      walks their OWN knight into a cage — the single most common
 *      game_review blunder narrative — can never license the word.
 *   2. The detectors are keyed to the played move's own position; a piece
 *      that is trapped on `fenBefore` but not re-detected on `fenAfter`
 *      (or vice-versa) falls through.
 *
 * So the keyword earns an OCCURRENCE-level exemption from the same arithmetic
 * the mobility check already computes: resolve the piece the sentence is
 * talking about (`resolveClaimPiece`), resolve which board the claim is about
 * (`resolveClaimFens` — the same conditioning-move / future-ply handling), and
 * license the occurrence when that piece has ZERO safe moves there, EVEN IF it
 * has legal moves. This never licenses anything the board does not back:
 * unresolvable pieces, unresolvable positions and pieces with a safe square
 * all still fire.
 *
 * Deliberately NOT weakened: a "no legal moves"/"N legal moves" claim is a
 * COUNT, and `checkMobilityLiteralClaims` still refutes it against raw
 * chess.js — a piece with 3 legal moves and 0 safe ones is "trapped" (allowed
 * here) but does NOT have "no legal moves" (still caught there).
 */
function isImmobilized(
  sentence: string,
  claimIndexInSentence: number,
  insight: InsightContract,
): boolean {
  const ref = resolveClaimPiece(sentence, claimIndexInSentence);
  if (!ref || ref.pieceLetter === "k") return false; // unresolvable / mate territory
  const fens = resolveClaimFens(sentence, insight);
  if (!fens) return false; // claim is about a position the contract cannot score
  const counts = fens
    .map((fen) => safeMobilityCount(fen, ref.square, ref.pieceLetter))
    .filter((c): c is number => c !== null);
  return counts.length > 0 && counts.some((c) => c === 0);
}

export function checkTacticalKeywords(
  prose: string,
  insight: InsightContract,
  contract?: CoachContract,
): RefereeViolation[] {
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
  const seen = new Set<string>(); // fix 6 — dedup identical (keyword) double-fires
  return result.issues
    .map((issue) => ({
      issue,
      // The shipped validator prefixes its span with the issue code — strip
      // it back to the bare keyword.
      keyword: issue.llm_span.replace(/^tactical_claim_ungrounded:/, ""),
    }))
    .filter(({ keyword }) => !allowed.has(keyword.toLowerCase()))
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
    // ROUND 2 — occurrence-level licensing. The validator fires per KEYWORD
    // over the whole prose; round 2 judges each OCCURRENCE's sentence:
    //   - word-boundary start (precision-pack post-filter, unchanged in
    //     effect: "developing" never counts as "pin");
    //   - fix 3, definitional sentences exempt (v2 #13);
    //   - fix 4b, king-context "trapped" exempt when the contract knows a
    //     mate — a mated king IS trapped, that is what mate means (v2 #30).
    // The keyword fires iff at least one occurrence is a non-exempt claim;
    // the fire's index points at the first such occurrence.
    .map(({ keyword }) => {
      const kwRe = new RegExp(
        `\\b${keyword.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}`,
        "gi",
      );
      let firstClaimIndex = -1;
      for (const m of Array.from(scrubbed.matchAll(kwRe))) {
        const idx = m.index ?? 0;
        const { start, end } = sentenceBounds(scrubbed, idx);
        const sentence = scrubbed.slice(start, end);
        if (isDefinitionalSentence(sentence)) continue; // fix 3
        // Verbalizer 4.1: the sentence cites a line-story ply whose facts say so.
        if (storyLicensesKeyword(keyword, sentence, insight)) continue;
        if (
          keyword.toLowerCase() === "trapped" &&
          /\bking\b/i.test(sentence) &&
          contractHasMate(insight, contract)
        ) {
          continue; // fix 4b — king-context license
        }
        // CI-5 FOLLOW-UP — board-truth license for the TRAPPED class.
        if (TRAPPED_CLASS_KEYWORDS.has(keyword.toLowerCase()) && isImmobilized(sentence, idx - start, insight)) {
          continue;
        }
        firstClaimIndex = idx;
        break;
      }
      return { keyword, firstClaimIndex };
    })
    .filter(({ firstClaimIndex }) => firstClaimIndex >= 0)
    .map(({ keyword, firstClaimIndex }) => ({
      check: "tactical_keyword" as const,
      category: "tactical_keyword_unbacked" as const,
      span: keyword,
      index: firstClaimIndex,
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

/** Corroborating eval swing threshold — founder's round-2 rule: ≥ 1.5 pawns. */
const HISTORY_SWING_CP = 150;

/**
 * ROUND 2 fix 6 — game-history exemption for strong positional words: the
 * sentence references a move that is IN the game history (exact SAN match
 * against the move table; piece designators for the insight's own FENs are
 * board references, not move recaps, and never qualify) AND the move table
 * shows a corroborating eval swing ≥ +1.5 pawns in the referenced mover's
 * favor from this insight's own anchor (evalBefore) to the position after
 * the referenced move. v2 #6: "d5 — pushing the knight off c6 and
 * dominating the center" — d5 is the game's ply-12 move and the table runs
 * 0.00 → +1.80+ across it; calling that "dominating" recaps an
 * engine-corroborated game swing, not a fabricated positional plan.
 */
function gameHistoryCorroborates(
  sentence: string,
  insight: InsightContract,
  contract?: CoachContract,
): boolean {
  if (!contract) return false;
  const anchor = insight.evalBefore.sentinel ? null : insight.evalBefore.cp;
  if (anchor === null) return false;
  const pieceMaps = [fenPieceMap(insight.fenBefore), fenPieceMap(insight.fenAfter)];
  const tokens = tokenizeProse(sentence).filter(
    (t) => t.kind === "piece_san" || t.kind === "pawn_or_square",
  );
  for (const t of tokens) {
    if (!t.norm) continue;
    // A piece standing on that square in this insight's FENs makes the token
    // a board designator ("the Nd4"), not a game-move recap.
    if (isPieceDesignatorLicensed(t.raw, pieceMaps)) continue;
    for (const row of contract.moveTable) {
      if (stripSanDecorations(row.san) !== t.norm) continue;
      // Forward-in-time only: the anchor→after-move swing is meaningless for
      // moves BEFORE this insight's position (round-1 #2's "eyeing d5"
      // mentions a ply-7 square-push behind a ply-9 insight — not a recap).
      if (row.ply < insight.ply) continue;
      const rowEval = row.evalAfter;
      if (!rowEval || rowEval.sentinel || rowEval.cp === null) continue;
      const swing = row.color === "w" ? rowEval.cp - anchor : anchor - rowEval.cp;
      if (swing >= HISTORY_SWING_CP) return true;
    }
  }
  return false;
}

/**
 * Plan §4 check 5 input (measurement form): claimClassesForbidden from
 * Degraded sources → keyword classes that must not appear. Detectors:
 *   - positional_plan → POSITIONAL_TOKEN_REGEX (imported from the serving
 *     validator), WITH its degraded-mode escape: SF alone decisive
 *     (|cp| ≥ 300 or a mate on the board) passes — mirrors
 *     validatePositionalClaim's lc0-unavailable behavior — and the round-2
 *     game-history exemption (gameHistoryCorroborates, contract-dependent).
 *   - endgame_wdl → tablebase/theoretical-outcome phrasings.
 *   - user_visibility → "obvious/obviously" (conservative subset; see
 *     module doc), EXEMPTING definitional sentences (follow-up fix B —
 *     isDefinitionalSentence, shared with the keyword path).
 * Other classes (tactical_motif, eval_numeric, …) are covered by the
 * dedicated checks above and not double-reported here.
 */
export function checkForbiddenClaims(
  prose: string,
  insight: InsightContract,
  contract?: CoachContract,
): RefereeViolation[] {
  const forbidden = forbiddenClaimClasses(insight);
  const violations: RefereeViolation[] = [];

  if (forbidden.has("positional_plan")) {
    const cp = insight.evalBefore.sentinel ? null : insight.evalBefore.cp;
    const mate = insight.evalBefore.sentinel ? null : insight.evalBefore.mate;
    const sfDecisive = (cp !== null && Math.abs(cp) >= 300) || mate !== null;
    if (!sfDecisive) {
      for (const m of Array.from(prose.matchAll(clone(POSITIONAL_TOKEN_REGEX)))) {
        const idx = m.index ?? 0;
        const { start, end } = sentenceBounds(prose, idx);
        if (gameHistoryCorroborates(prose.slice(start, end), insight, contract)) continue; // round-2 fix 6
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
      // FOLLOW-UP PACK fix B — definitional-sentence exemption, the SAME test
      // checkTacticalKeywords has used since round 2 (fix 3). A sentence with
      // no square token, no SAN token and no piece-on-square reference is
      // teaching a CONCEPT, not asserting what THIS user could see. v3 FP:
      // «An "intermezzo" (or zwischenzug) is an in-between move — instead of
      // doing the obvious thing, you insert a forcing move first…». The
      // omission was an oversight: isDefinitionalSentence was wired into the
      // keyword path only, so the visibility path re-fired on the same
      // sentence shape the keyword path had already exempted.
      const { start, end } = sentenceBounds(prose, m.index ?? 0);
      if (isDefinitionalSentence(prose.slice(start, end))) continue;
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
/** `contract`, when provided, widens the eval_display (precision-pack fix 7)
 * AND SAN/square (follow-up fix A) license pools to contract-global facts. */
export function runInsightChecks(
  prose: string,
  insight: InsightContract,
  contract?: CoachContract,
): RefereeViolation[] {
  return [
    ...checkEvalDisplays(prose, insight, contract),
    ...checkSanWhitelist(prose, insight, { contract }),
    ...checkTacticalKeywords(prose, insight, contract),
    ...checkForbiddenClaims(prose, insight, contract),
    // FOLLOW-UP fix D: the LITERAL mobility family (counts, not judgments)
    // graduated onto the serving path — 9/9 TRUE_FABRICATION, 0 FP in v3.
    ...checkMobilityLiteralClaims(prose, insight),
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
  // Chess-aware split — a naive one counted "8... Ba5+ 9. Bd2 Bb4" as three
  // claim sentences, inflating the fabrication-rate denominator.
  return splitProseSentences(prose).filter((s) => isClaimSentence(s)).length;
}

// NOTE: pv_truncation is deliberately absent — it never runs through
// runInsightChecks/aggregateFidelity, only through the --fp-measure harness.
// mobility_claims IS here since fix D put its literal family on the serving
// path (the qualitative family stays measurement-only).
const CHECK_NAMES: RefereeCheckName[] = [
  "eval_display",
  "san_whitelist",
  "tactical_keyword",
  "forbidden_claim",
  "mobility_claims",
];
const CATEGORY_NAMES: RefereeViolationCategory[] = [
  "eval_unbacked",
  "mate_distance_wrong",
  "san_unknown",
  "square_unknown",
  "hypothetical_line_off_contract",
  "tactical_keyword_unbacked",
  "forbidden_claim_present",
  "mobility_count_wrong",
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

/**
 * Favorable-outcome assertion ("you've won material", "wins the exchange").
 *
 * FOLLOW-UP PACK fix C: the window is capped at 40 chars AND must not cross a
 * clause/purpose break. v3 fire #1 read "winning a tempo to recapture the
 * queen" as a queen-win claim — the "to <verb>" makes the queen the object of
 * the SUBORDINATE clause, not of "winning". The break list is the same
 * grammar-free device the tokenizer uses for move runs: punctuation plus the
 * conjunctions/prepositions that start a new clause.
 */
const FAVORABLE_OUTCOME_RE =
  /\b(?:you(?:'ve|’ve| have)?\s+(?:won|win)|wins?|winning|won)\b([^.!?\n]{0,40}?)\b(?:material|the exchange|an exchange|a piece|the piece|a pawn|the pawn|the queen|the rook|the bishop|the knight)\b/gi;
const OUTCOME_WINDOW_BREAK_RE = /[,;:—–]|\b(?:to|and|but|while|after|before|because|so|then|unless|instead|if|when|once)\b/i;

/** True when the sentence carries an UNBROKEN favorable-outcome assertion. */
function assertsFavorableOutcome(sentence: string): boolean {
  for (const m of Array.from(sentence.matchAll(clone(FAVORABLE_OUTCOME_RE)))) {
    if (!OUTCOME_WINDOW_BREAK_RE.test(m[1] ?? "")) return true;
  }
  return false;
}

/** Capture/gain verbs — the "in words" half of the fix-C G1 disclosure test. */
const CAPTURE_VERB_RE =
  /\b(?:tak(?:e|es|en|ing)|took|captur(?:e|es|ed|ing)|recaptur(?:e|es|ed|ing)|win(?:s|ning)?|won|grab(?:s|bed|bing)?|snag(?:s|ged|ging)?|collect(?:s|ed|ing)?|pick(?:s|ed|ing)?\s+(?:it\s+)?up)\b/gi;
/** Clause boundary — the disclosure must be the capture verb's OWN object,
 * not a noun that happens to appear later in the sentence. Same break list as
 * the favorable-outcome window. */
const CLAUSE_BREAK_RE = OUTCOME_WINDOW_BREAK_RE;

const PIECE_SYMBOL_WORD: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/**
 * fix C, GAP 1 — same-sentence continuation. A "truncation" only exists when
 * the prose HIDES the reply; a sentence that names it — as SAN or in words —
 * has disclosed it, and the reader is not being misled.
 *
 * v3 #1: "- Ne6+ forces fxe6, opening the f-file…" quotes fxe6 outright.
 * v3 #3: "Ne6+ forces Black to capture with the f-pawn, and then White can
 * take the queen on c1…" spells both replies out in words. Both were scored
 * as concealed truncations.
 *
 * Mechanical test (no judgment): the ply's SAN appears verbatim, OR a capture
 * verb's OWN CLAUSE (verb → next clause break) names the ply's destination
 * square, its captured piece, or its mover ("the f-pawn" / "the queen" / …).
 * The clause restriction is load-bearing: "you've won material while your
 * knight dominates the board" (precision-pack TF #28) mentions a knight, but
 * not as the object of the capture — that span must keep firing.
 */
function plyDisclosedInSentence(sentence: string, step: PvMaterialStep): boolean {
  const san = stripSanDecorations(step.san);
  if (san && new RegExp(`(?:^|[^A-Za-z0-9])${escapeRe(san)}(?![A-Za-z0-9])`).test(sentence)) {
    return true;
  }
  const capturedWord = step.captured ? PIECE_SYMBOL_WORD[step.captured] : null;
  const moverPattern =
    step.piece === "p"
      ? /^[a-h]$/.test(san[0] ?? "")
        ? new RegExp(`\\b${san[0]}[- ]pawn\\b`, "i")
        : /\bpawns?\b/i
      : new RegExp(`\\b${PIECE_SYMBOL_WORD[step.piece] ?? "\\0"}s?\\b`, "i");
  for (const m of Array.from(sentence.matchAll(clone(CAPTURE_VERB_RE)))) {
    const after = sentence.slice((m.index ?? 0) + m[0].length);
    const brk = after.search(CLAUSE_BREAK_RE);
    const clause = brk >= 0 ? after.slice(0, brk) : after;
    if (new RegExp(`\\b${step.to}\\b`).test(clause)) return true;
    if (capturedWord && new RegExp(`\\b${capturedWord}s?\\b`, "i").test(clause)) return true;
    if (moverPattern.test(clause)) return true;
  }
  return false;
}

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
 * A truncating capture by the claimant themselves is never a violation (it
 * extends the harvest), and an unreplayable PV ply makes the match
 * unverifiable — skipped, never fired on (precision first).
 *
 * FOLLOW-UP PACK fix C (v3: 5 fires, 0 TF / 4 FP by adjudication) closed three
 * implementation gaps — see the inline GAP 1/2/3 notes:
 *   G1  same-sentence continuation: a reply the sentence already names, as SAN
 *       or in words, is disclosed, not truncated (v3 #1/#3);
 *   G2  claimant attribution: the claimant is the SENTENCE's asserting side —
 *       an opponent reply quoted mid-sentence opens no window of its own, and
 *       the check fires at most once per sentence (v3 #2);
 *   G3  PV occurrence selection: judge the line where the quote is the FIRST
 *       ply, else the highest-ranked line containing it, instead of the first
 *       arbitrary match and its unrelated end eval (v3 #4).
 * Plus a tightened FAVORABLE_OUTCOME_RE window (assertsFavorableOutcome).
 * Still MEASUREMENT-ONLY: 0 measured true fabrications means no arming
 * evidence in either direction.
 */
export function checkPvTruncation(prose: string, insight: InsightContract): RefereeViolation[] {
  const sources = buildPvSources(insight);
  if (sources.length === 0) return [];
  const tokens = tokenizeProse(prose);
  const violations: RefereeViolation[] = [];
  const replayCache = new Map<PvSource, PvMaterialStep[]>();
  const stepsFor = (src: PvSource): PvMaterialStep[] => {
    let steps = replayCache.get(src);
    if (!steps) {
      steps = replayPvMaterial(insight.fenBefore, src.sans);
      replayCache.set(src, steps);
    }
    return steps;
  };

  // ── Collect quoted move runs (same run grammar as the whitelist pass,
  //    including the fix-3 clause-separator break) ─────────────────────────
  interface Run {
    seq: string[];
    firstIndex: number;
    lastIndex: number;
  }
  const runs: Run[] = [];
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
    if (moveIdx.length >= 1 && moveIdx.some((k) => tokens[k].kind === "piece_san")) {
      runs.push({
        seq: moveIdx.map((k) => tokens[k].norm),
        firstIndex: tokens[moveIdx[0]].index,
        lastIndex: tokens[moveIdx[moveIdx.length - 1]].index,
      });
    }
    i = j;
  }

  // ── fix C, GAP 2 — claimant attribution + per-sentence dedup ────────────
  // The claimant is the SENTENCE's asserting side, not "the mover of the
  // first ply of whatever run we happen to be looking at". v3 #2: inside
  // "- Ne6+ forces fxe6, …", Black's reply fxe6 opened its OWN claim window
  // with Black as claimant, and the White continuation Qxc1 then read as a
  // 9-for-3 give-back against Black — a second fire on the same sentence
  // asserting the same thing. Only the sentence's FIRST quoted run may open a
  // window, which also caps the check at one fire per sentence.
  const firstRunOfSentence = new Map<number, Run>();
  for (const run of runs) {
    const { start } = sentenceBounds(prose, run.firstIndex);
    if (!firstRunOfSentence.has(start)) firstRunOfSentence.set(start, run);
  }

  for (const [sentStart, run] of Array.from(firstRunOfSentence.entries())) {
    const { start, end } = sentenceBounds(prose, run.lastIndex);
    // A run that spills past its sentence terminator is judged on the
    // sentence it STARTS in (sentStart) — same anchor the dedup used.
    const sentence = prose.slice(Math.min(start, sentStart), end);
    if (!assertsFavorableOutcome(sentence)) continue;

    // ── fix C, GAP 3 — PV occurrence selection ────────────────────────────
    // A quoted move can appear in several contract lines. v3 #4 ("Qxc1
    // simply wins the queen") matched Qxc1 deep inside MultiPV-2 and imported
    // THAT branch's −1.71 end eval, while MultiPV-1 — where Qxc1 is the first
    // ply — supports the claim outright. Prefer the line where the quote
    // STARTS the line; otherwise the highest-ranked line containing it
    // (buildPvSources order = engine MultiPV rank, then branch points, then
    // threats). Exactly one occurrence is judged.
    let best: { src: PvSource; off: number; rank: number } | null = null;
    for (let rank = 0; rank < sources.length; rank++) {
      const src = sources[rank];
      for (let off = 0; off + run.seq.length <= src.sans.length; off++) {
        if (!run.seq.every((s, k) => src.sans[off + k] === s)) continue;
        const better =
          best === null ||
          (off === 0 ? 0 : 1) < (best.off === 0 ? 0 : 1) ||
          ((off === 0 ? 0 : 1) === (best.off === 0 ? 0 : 1) && rank < best.rank);
        if (better) best = { src, off, rank };
        break; // first offset within this line is enough (earliest occurrence)
      }
    }
    if (!best) continue;

    const { src, off } = best;
    const e = off + run.seq.length - 1;
    if (e + 1 >= src.sans.length) continue; // full-tail quote — nothing truncated
    const steps = stepsFor(src);
    if (steps.length < e + 2) continue; // unreplayable ply — unverifiable, never fire
    const claimant = steps[off].mover;
    const next = steps[e + 1];
    if (next.capturedValue === 0) continue; // quiet continuation
    if (next.mover === claimant) continue; // claimant's own follow-up capture
    // fix C, GAP 1 — the reply is disclosed in the same sentence.
    if (plyDisclosedInSentence(sentence, next)) continue;

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
    if (!quiescenceViolated && !endContradicts) continue;

    violations.push({
      check: "pv_truncation",
      category: "pv_truncation_suspect",
      span: run.seq.join(" "),
      index: run.firstIndex,
      detail:
        `quoted line "${run.seq.join(" ")}" stops one ply before ${next.san} in the contract PV while asserting a favorable outcome ("${sentence.trim().slice(0, 100)}…") — ` +
        (quiescenceViolated
          ? `material quiescence violated: ${next.san} takes back ${next.capturedValue} vs ${banked} banked in the window`
          : `outcome contradicts the ${endNote}`),
    });
  }
  return violations;
}

/** "15 legal moves" / "15 active squares" style bare-integer mobility claims. */
const MOBILITY_CLAIM_RE = /\b(\d{1,2})\s+(?:legal moves?|active squares?|available (?:moves?|squares?)|squares? of activity)\b/gi;
/** Piece references: "queen on f3" / "knight at d4" / "knight to e7" /
 * designator "Qf3". ROUND 2 added "to" — "moving the knight TO e7 leaves it
 * with zero legal moves" (v2 #2) references the piece at its destination. */
const PIECE_ON_SQUARE_RE = /\b(queen|rook|bishop|knight|king|pawn)\s+(?:on|at|to)\s+([a-h][1-8])\b/i;
/**
 * ROUND 2 fix 4b — zero-mobility claims, split into two FAMILIES by the
 * follow-up pack (fix D) because they carry different evidence:
 *
 *  LITERAL — "no/zero legal moves", "no moves", and the bare-integer counts
 *  above. These are COUNTS: chess.js either agrees or it does not, and there
 *  is nothing to argue about. v3 measured 9 fires, adjudicated 9
 *  TRUE_FABRICATION / 0 FALSE_POSITIVE, so this family graduated onto the
 *  serving path (runInsightChecks) and arms at error. Judgment phrasings
 *  ("no GOOD squares") are deliberately absent: an armed check may only ever
 *  refute arithmetic.
 *
 *  QUALITATIVE — "no good squares", "no safe retreat/square", "nowhere to
 *  go", "no escape". These are scored against countSafeMoves (flight squares
 *  not covered by the enemy — the immobilized-piece detector's arithmetic),
 *  which is a REASONABLE proxy for the claim but not the claim itself; v3 #10
 *  ("no good squares", 5 safe moves available) shows the gap. Stays
 *  MEASUREMENT-ONLY.
 *
 * The v2 TF class #0/#2/#4/#5/#8 (knights with 4-6 legal moves, or safe
 * squares, called trapped-with-no-moves) fires in one family or the other
 * even when a genuinely trapped piece elsewhere licenses the "trapped"
 * keyword; the FP class #27 (Na8, both flight squares covered) does not — the
 * claim is board-true.
 */
const ZERO_MOBILITY_LITERAL_RE = /\b(?:(?:no|zero)\s+legal\s+moves?|no\s+moves)\b/gi;
/**
 * A hedge in front of the phrase turns an absolute count into an estimate:
 * "the knight on a8 has ALMOST no legal moves" (v4-a span 07/s2/M3, 2 legal
 * moves) is fair prose, not a fabricated zero. An armed check must not
 * enforce against hedged language.
 */
const ZERO_MOBILITY_HEDGE_RE =
  /\b(?:almost|nearly|virtually|practically|effectively|essentially|hardly|next to)\s*$/i;
const ZERO_MOBILITY_QUALITATIVE_RE =
  /\b(?:no\s+good\s+squares?|no\s+safe\s+(?:squares?|retreats?)|no\s+safe\s+square\s+to\s+retreat|nowhere\s+to\s+go|no\s+escape)\b/gi;
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

/** ROUND 2 fix 4b — SAFE-move count (flight squares not covered by the
 * enemy; countSafeMoves in the trapped-piece detector), turn-corrected the
 * same way as mobilityCount. */
function safeMobilityCount(fen: string, square: string, pieceLetter: string): number | null {
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
    return countSafeMoves(game, square as never);
  } catch {
    return null;
  }
}

// ── fix D, soundness gap (a): piece attribution ─────────────────────────────
/** A piece reference inside a sentence, with its offset. */
interface SentencePieceRef {
  pieceLetter: string;
  square: string;
  index: number;
}

/** "queen on f3" / "knight at d4" / "knight to e7". */
const PIECE_ON_SQUARE_G_RE = /\b(queen|rook|bishop|knight|king|pawn)\s+(?:on|at|to)\s+([a-h][1-8])\b/gi;
/** "Ne7→c6" / "Ne7-c6" / "Ne7 to c6" — a MOVE description: the piece is being
 * named at its DESTINATION, not at its origin (v3 #6). */
const PIECE_MOVE_TO_RE = /\b([KQRBN])[a-h][1-8]\s*(?:→|-{1,2}>|–|—|-|\bto\b)\s*([a-h][1-8])\b/g;
/** Bare designator "Qf3", "Nc6". */
const PIECE_DESIGNATOR_G_RE = /\b([KQRBN])([a-h][1-8])\b/g;
/** Reversed prose form: "the e7 knight", "the d5-knight" (v4 span 01/s1/I2 —
 * "…and the e7 knight is trapped with no moves" was attributed to the Nc3
 * designator earlier in the sentence). */
const SQUARE_THEN_PIECE_RE = /\b([a-h][1-8])[-\s](queen|rook|bishop|knight|king|pawn)\b/gi;

/**
 * Every piece reference in the sentence, in offset order. Arrow/"to" move
 * descriptions are consumed first so their ORIGIN designator cannot be
 * re-read as a standing-piece reference.
 */
function collectSentencePieceRefs(sentence: string): SentencePieceRef[] {
  const refs: SentencePieceRef[] = [];
  const consumed: Array<[number, number]> = [];
  const overlaps = (start: number, end: number) =>
    consumed.some(([s, e]) => start < e && end > s);

  for (const m of Array.from(sentence.matchAll(clone(PIECE_MOVE_TO_RE)))) {
    const start = m.index ?? 0;
    consumed.push([start, start + m[0].length]);
    refs.push({
      pieceLetter: m[1].toLowerCase(),
      square: m[2],
      index: start,
    });
  }
  for (const m of Array.from(sentence.matchAll(clone(PIECE_ON_SQUARE_G_RE)))) {
    const start = m.index ?? 0;
    if (overlaps(start, start + m[0].length)) continue;
    const letter = PIECE_NAME_TO_LETTER[m[1].toLowerCase()];
    if (!letter) continue;
    refs.push({ pieceLetter: letter, square: m[2], index: start });
  }
  for (const m of Array.from(sentence.matchAll(clone(SQUARE_THEN_PIECE_RE)))) {
    const start = m.index ?? 0;
    if (overlaps(start, start + m[0].length)) continue;
    const letter = PIECE_NAME_TO_LETTER[m[2].toLowerCase()];
    if (!letter) continue;
    consumed.push([start, start + m[0].length]);
    refs.push({ pieceLetter: letter, square: m[1], index: start });
  }
  for (const m of Array.from(sentence.matchAll(clone(PIECE_DESIGNATOR_G_RE)))) {
    const start = m.index ?? 0;
    if (overlaps(start, start + m[0].length)) continue;
    refs.push({ pieceLetter: m[1].toLowerCase(), square: m[2], index: start });
  }
  return refs.sort((a, b) => a.index - b.index);
}

/**
 * fix D, gap (a): the claim is about the piece the sentence was TALKING ABOUT
 * when it made the claim — the nearest reference at or before the claim span,
 * falling back to the nearest one after it. v3 scored two spans against the
 * wrong piece by taking the sentence's first `piece on square` match:
 *   #9 "Nc6, the knight is immediately trapped with no legal moves, the
 *       bishop on b6 is equally immobile…" → scored the B on b6;
 *   #6 "- Ne7→c6: … finds itself immediately trapped with no legal moves." →
 *       scored the N on e7 (its ORIGIN) instead of c6.
 */
function resolveClaimPiece(sentence: string, claimIndex: number): SentencePieceRef | null {
  const refs = collectSentencePieceRefs(sentence);
  if (refs.length === 0) return null;
  let before: SentencePieceRef | null = null;
  for (const r of refs) {
    if (r.index <= claimIndex) before = r;
    else break;
  }
  return before ?? refs[0];
}

// ── fix D, soundness gap (b): claims about a LATER position ─────────────────
/** "by move 10", "on move 24" — a future ply with no FEN in the contract. */
const FUTURE_MOVE_NUMBER_RE = /\b(?:by|on|until|after|before|around|past)\s+move\s+\d+\b/i;
/** "after White plays h3", "once Black takes on e5", "after g6" — the claim is
 * about the position AFTER the named move. */
const CONDITIONING_MOVE_RE =
  /\b(?:after|once|when|if)\s+(?:white|black|you|your opponent|they|he|she)?\s*(?:plays?|played|pushes|pushed|goes|takes|captures|recaptures)?\s*([A-Za-z][A-Za-z0-9=+#-]*)(?![A-Za-z0-9])/gi;

/** FENs reachable by playing `san` from any of `fens` (turn-flipped clones
 * included — a hypothetical reply may be out of turn in the quoted FEN). */
function fensAfterSan(san: string, fens: string[]): string[] {
  const out: string[] = [];
  for (const fen of fens) {
    const candidates = [fen];
    const parts = fen.split(" ");
    if (parts.length >= 4) {
      parts[1] = parts[1] === "w" ? "b" : "w";
      parts[3] = "-";
      candidates.push(parts.join(" "));
    }
    for (const c of candidates) {
      try {
        const game = new Chess(c);
        if (!game.move(san)) continue;
        out.push(game.fen());
        break;
      } catch {
        /* illegal from this base — try the next */
      }
    }
  }
  return out;
}

/**
 * fix D, gap (b): which board a mobility claim should be scored against.
 * Returns the insight FENs by default, the FENs after a named conditioning
 * move when the sentence anchors the claim to one, or null when the
 * referenced position cannot be resolved — in which case the claim is SKIPPED
 * rather than scored against the wrong board. v3:
 *   #7  "…with no legal moves by move 10"        → unresolvable future ply;
 *   #12 "…no safe retreat after White plays h3"  → resolvable, score there.
 * A conditioning move equal to the insight's own played move needs no
 * override — fenAfter already IS that position (v3 #14, "after g6 closes the
 * diagonal", where g6 is the played move).
 */
function resolveClaimFens(sentence: string, insight: InsightContract): string[] | null {
  if (FUTURE_MOVE_NUMBER_RE.test(sentence)) return null;
  const played = stripSanDecorations(insight.playedSan ?? "");
  const base = [insight.fenBefore, insight.fenAfter];
  for (const m of Array.from(sentence.matchAll(clone(CONDITIONING_MOVE_RE)))) {
    const raw = m[1] ?? "";
    if (!SEQ_MOVE_RE.test(raw)) continue; // not a move token — no conditioning
    const norm = stripSanDecorations(raw);
    if (!norm || norm === played) continue; // fenAfter already is that position
    const derived = fensAfterSan(norm, base);
    return derived.length > 0 ? derived : null;
  }
  return base;
}

/**
 * Fix 10 — mobility_claims, LITERAL family (follow-up fix D): bare-integer
 * mobility/square-count claims and "no/zero legal moves" phrasings verified
 * against raw chess.js move counts from the position the claim is about. The
 * adjudicated class: fixture 01's thrice-repeated "queen on f3 … 15 active
 * squares / 15 legal moves" (spans #2/#4/#7 context) and v3's six
 * "trapped with no legal moves" knights that chess.js gives 4-6 moves — a
 * concrete number the board contradicts. Fires ONLY when a piece+square
 * reference is resolvable in the same sentence and the claimed count matches
 * NO scored position; unverifiable claims are skipped (precision first).
 *
 * v3: 9 fires / 9 TRUE_FABRICATION / 0 FALSE_POSITIVE → this family runs on
 * the SERVING path (runInsightChecks) and is armed at error.
 */
export function checkMobilityLiteralClaims(
  prose: string,
  insight: InsightContract,
): RefereeViolation[] {
  const violations: RefereeViolation[] = [];

  for (const m of Array.from(prose.matchAll(clone(MOBILITY_CLAIM_RE)))) {
    const claimed = Number.parseInt(m[1], 10);
    if (!Number.isFinite(claimed)) continue;
    const idx = m.index ?? 0;
    const { start, end } = sentenceBounds(prose, idx);
    const sentence = prose.slice(start, end);
    const ref = resolveClaimPiece(sentence, idx - start);
    if (!ref) continue; // unverifiable — skip, never guess
    const fens = resolveClaimFens(sentence, insight);
    if (!fens) continue; // claim is about an unresolvable position — skip
    const counts = fens
      .map((fen) => mobilityCount(fen, ref.square, ref.pieceLetter))
      .filter((c): c is number => c !== null);
    if (counts.length === 0) continue; // piece not on that square in any scored FEN
    if (counts.some((c) => c === claimed)) continue; // board backs the number
    violations.push({
      check: "mobility_claims",
      category: "mobility_count_wrong",
      span: m[0],
      index: idx,
      detail: `mobility claim "${m[0]}" for the ${ref.pieceLetter.toUpperCase()} on ${ref.square} contradicts chess.js (actual: ${counts.join("/")} legal move(s) in the scored position(s))`,
    });
  }

  for (const m of Array.from(prose.matchAll(clone(ZERO_MOBILITY_LITERAL_RE)))) {
    const v = judgeZeroMobility(prose, insight, m, mobilityCount, "legal");
    if (v) violations.push(v);
  }

  return violations;
}

/**
 * mobility_claims, QUALITATIVE family (follow-up fix D): "no good squares",
 * "no safe retreat/square", "nowhere to go", "no escape" — scored against
 * countSafeMoves (flight squares not covered by the enemy). A reasonable
 * proxy, not the claim itself, so this family stays MEASUREMENT-ONLY: v3 #10
 * ("Nc6 looks active, but the knight has no good squares") was refuted with a
 * safe-move count, which is an argument about quality, not arithmetic.
 */
export function checkMobilityQualitativeClaims(
  prose: string,
  insight: InsightContract,
): RefereeViolation[] {
  const violations: RefereeViolation[] = [];
  for (const m of Array.from(prose.matchAll(clone(ZERO_MOBILITY_QUALITATIVE_RE)))) {
    const v = judgeZeroMobility(prose, insight, m, safeMobilityCount, "safe");
    if (v) violations.push(v);
  }
  return violations;
}

/** Shared zero-claim judgement for both families (ROUND 2 fix 4b semantics:
 * fires only when NO scored position backs a zero count — a piece that truly
 * has 0 moves licenses the claim, v2 FP #27's Na8). */
function judgeZeroMobility(
  prose: string,
  insight: InsightContract,
  m: RegExpMatchArray,
  counter: (fen: string, square: string, pieceLetter: string) => number | null,
  label: "legal" | "safe",
): RefereeViolation | null {
  const idx = m.index ?? 0;
  if (ZERO_MOBILITY_HEDGE_RE.test(prose.slice(Math.max(0, idx - 24), idx))) return null; // hedged
  const { start, end } = sentenceBounds(prose, idx);
  const sentence = prose.slice(start, end);
  const ref = resolveClaimPiece(sentence, idx - start);
  if (!ref || ref.pieceLetter === "k") return null; // unverifiable / king-context (mate territory)
  const fens = resolveClaimFens(sentence, insight);
  if (!fens) return null; // claim is about an unresolvable position — skip
  const counts = fens
    .map((fen) => counter(fen, ref.square, ref.pieceLetter))
    .filter((c): c is number => c !== null);
  if (counts.length === 0) return null; // piece not on that square in any scored FEN
  if (counts.some((c) => c === 0)) return null; // the board backs the zero claim
  return {
    check: "mobility_claims",
    category: "mobility_count_wrong",
    span: m[0],
    index: idx,
    detail: `zero-mobility claim "${m[0]}" for the ${ref.pieceLetter.toUpperCase()} on ${ref.square} contradicts chess.js (actual: ${counts.join("/")} ${label} move(s) in the scored position(s))`,
  };
}

/** Both mobility families — the historical entry point (round-2 suite, and
 * anything that wants the full picture regardless of arming status). */
export function checkMobilityClaims(prose: string, insight: InsightContract): RefereeViolation[] {
  return [
    ...checkMobilityLiteralClaims(prose, insight),
    ...checkMobilityQualitativeClaims(prose, insight),
  ];
}

/** The --fp-measure harness's entry for the checks that are still
 * MEASUREMENT-ONLY. The mobility LITERAL family graduated out of here in the
 * follow-up pack (fix D) and now runs in runInsightChecks. */
export function runMeasurementOnlyChecks(
  prose: string,
  insight: InsightContract,
): RefereeViolation[] {
  return [...checkPvTruncation(prose, insight), ...checkMobilityQualitativeClaims(prose, insight)];
}

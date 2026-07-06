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
import type { AnyMotif } from "@/lib/tactics/types";
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
  | "forbidden_claim";

export type RefereeViolationCategory =
  | "eval_unbacked" // signed pawn figure with no contract eval within ±0.3
  | "mate_distance_wrong" // M±n / "mate in n" with no matching contract mate
  | "san_unknown" // SAN-shaped token not derivable from the contract
  | "square_unknown" // bare square + claim verb, square not in the contract
  | "hypothetical_line_off_contract" // multi-move sequence, not a PV prefix
  | "tactical_keyword_unbacked"
  | "forbidden_claim_present";

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

function stripSanDecorations(san: string): string {
  return san.replace(/[+#!?]+$/g, "");
}

// ── Check 1: eval displays ──────────────────────────────────────────────────
interface EvalPools {
  /** Pawn values (cp/100) the contract can back. */
  pawns: number[];
  /** Signed mate distances the contract can back. */
  mates: number[];
}

function collectEvalPools(insight: InsightContract): EvalPools {
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
 * Plan §4 check 2 (measurement form): every ±N.NN span must land within
 * ±0.3 pawns of a contract eval; every M±n / "mate in n" span must match a
 * contract mate distance exactly (signed for M±n; absolute for "mate in n",
 * which does not encode a side).
 */
export function checkEvalDisplays(prose: string, insight: InsightContract): RefereeViolation[] {
  const pools = collectEvalPools(insight);
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

function fenPieceSquares(fen: string): string[] {
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

interface Whitelist {
  /** Normalized SAN tokens (decorations stripped) the contract can back. */
  san: Set<string>;
  /** Squares the contract can back (plan §4 check 3 set). */
  squares: Set<string>;
  /** Candidate PVs for the hypothetical-line prefix allowance (normalized). */
  pvs: string[][];
}

function buildWhitelist(insight: InsightContract): Whitelist {
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
  const addPv = (line: (string | null | undefined)[]) => {
    const filtered = line.filter((s): s is string => !!s).map(stripSanDecorations);
    if (filtered.length > 0) pvs.push(filtered);
    for (const s of filtered) addSan(s);
  };

  addSan(insight.playedSan);
  addSan(insight.bestSan);
  for (const line of insight.lines) {
    addPv(line.san);
    for (const uci of line.pvUci) for (const sq of uciSquares(uci)) squares.add(sq);
  }
  if (insight.branchPoint) {
    addPv([...insight.branchPoint.sharedSan, insight.branchPoint.bestContinues]);
    addPv([...insight.branchPoint.sharedSan, insight.branchPoint.playedGoes]);
  }
  if (insight.intelBranchPoint) {
    addPv([...insight.intelBranchPoint.sharedSan, insight.intelBranchPoint.bestContinues]);
    addPv([...insight.intelBranchPoint.sharedSan, insight.intelBranchPoint.altContinues]);
  }
  for (const line of threatSanLines(insight.threats)) addPv(line);
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

interface ProseToken {
  raw: string;
  norm: string;
  /** Offset of the STRIPPED token in the prose. */
  index: number;
  /** Original whitespace-delimited word span (for overlap dedup). */
  wordStart: number;
  wordEnd: number;
  kind: "piece_san" | "pawn_or_square" | "move_number" | "other";
}

function tokenizeProse(prose: string): ProseToken[] {
  const tokens: ProseToken[] = [];
  const wordRe = /[^\s]+/g;
  for (const m of Array.from(prose.matchAll(wordRe))) {
    const word = m[0];
    const wordStart = m.index ?? 0;
    // Strip common surrounding punctuation, keep move/SAN internals.
    const leading = word.match(/^[("'“”‘’[]+/)?.[0] ?? "";
    const stripped = word.slice(leading.length).replace(/[)"'“”‘’\],;:.!?]+$/, "");
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
function isPvWindow(seq: string[], pvs: string[][]): boolean {
  return pvs.some((pv) => {
    if (pv.length < seq.length) return false;
    for (let off = 0; off + seq.length <= pv.length; off++) {
      if (seq.every((s, i) => pv[off + i] === s)) return true;
    }
    return false;
  });
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

/**
 * Plan §4 check 3 (measurement form): every unambiguous SAN token and every
 * bare square coupled with a claim verb must be derivable from the contract.
 * Includes the §4.3 hypothetical-line allowance (see isPvWindow): multi-move
 * SAN sequences are legal iff they sit inside a contract PV; off-contract
 * sequences report ONE `hypothetical_line_off_contract` violation (members
 * are not double-reported individually).
 */
export function checkSanWhitelist(prose: string, insight: InsightContract): RefereeViolation[] {
  const wl = buildWhitelist(insight);
  const violations: RefereeViolation[] = [];
  const tokens = tokenizeProse(prose);
  const consumed = new Set<number>(); // token indices already judged in a sequence

  // ── Pass 1: move sequences (≥2 moves, move-numbers allowed between) ──────
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
        j++;
      }
      const moveIdx = runIdx.filter((k) => tokens[k].kind !== "move_number");
      const hasPieceSan = moveIdx.some((k) => tokens[k].kind === "piece_san");
      // A run only counts as a MOVE SEQUENCE when it has ≥2 moves and at
      // least one unambiguous SAN ("e4 e5" alone is more likely two square
      // references than a line; precision first).
      if (moveIdx.length >= 2 && hasPieceSan) {
        const seq = moveIdx.map((k) => tokens[k].norm);
        for (const k of moveIdx) consumed.add(k);
        if (!isPvWindow(seq, wl.pvs)) {
          violations.push({
            check: "san_whitelist",
            category: "hypothetical_line_off_contract",
            span: seq.join(" "),
            index: tokens[moveIdx[0]].index,
            detail: `move sequence "${seq.join(" ")}" is not a contiguous window of any contract PV (plan §4.3 hypothetical-line rule, measurement-widened from prefix)`,
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
    if (!wl.san.has(t.norm)) {
      violations.push({
        check: "san_whitelist",
        category: "san_unknown",
        span: t.raw,
        index: t.index,
        detail: `SAN token "${t.raw}" does not occur in the contract (lines/branch points/threats/motifs/played/best)`,
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
    if (!wl.san.has(norm)) {
      violations.push({
        check: "san_whitelist",
        category: "san_unknown",
        span: m[0],
        index: idx,
        detail: `SAN token "${m[0]}" does not occur in the contract (lines/branch points/threats/motifs/played/best)`,
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
export function checkTacticalKeywords(prose: string, insight: InsightContract): RefereeViolation[] {
  const result = validateMotifGrounding({
    llmResponse: prose,
    detectedMotifs: insight.motifs,
    fen: insight.fenBefore,
    moveSan: insight.playedSan,
    correlationId: `fidelity:${insight.factIdPrefix}`,
  });
  const allowed = new Set(insight.allowedTacticalKeywords.map((k) => k.toLowerCase()));
  const lower = prose.toLowerCase();
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
      new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}`, "i").test(prose),
    )
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
export function runInsightChecks(prose: string, insight: InsightContract): RefereeViolation[] {
  return [
    ...checkEvalDisplays(prose, insight),
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
    for (const v of runInsightChecks(prose, insight)) {
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

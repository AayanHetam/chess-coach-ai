/**
 * Contract projections (PR-CI-1 scope item 4).
 *
 * - renderLegacyPrompt(contract): THE single source of the legacy prompt
 *   string templates (moved out of buildGameContext). Byte-identical to the
 *   pre-contract output — pinned by the commit-1 snapshot suite, which must
 *   stay green WITHOUT regeneration.
 * - serializeForVerbalizer(contract): canonical sorted-key JSON with the
 *   timestamp fields (builtAtMs/buildMs) stripped. Shadow-logging fuel today;
 *   the CI-4 flagship user turn later. Canonical ordering matters: a byte-
 *   stable serialization is what keeps the Anthropic prompt-cache prefix warm
 *   (plan §8) and makes contract hashing meaningful.
 *
 * RENDERING DISCIPLINE: the legacy renderer derives every number from the
 * contract's STRUCTURED fields using the exact legacy branch logic per call
 * site (e.g. the TOP MISTAKES header renders the ±9999-flattened numbers, the
 * candidate list has a "?" fallback, the Best-was list an "" fallback, and
 * only the MOVE-BY-MOVE eval consults the sentinel flag). EvalFact.display is
 * the canonical form for the future verbalizer — deliberately NOT used here,
 * because the legacy sites disagree with each other in exactly these ways.
 */
import { buildPgnFromMoves, formatPvAsMoveList } from "./chessFormat";
import { projectLineStory, type LineStory } from "./lineStory";
import type { PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import type { ThreatNode } from "@/lib/mastermind/threatTree";
import type {
  CoachContract,
  ConceptFact,
  InsightContract,
  LineFact,
  MoveTableEntry,
} from "./types";

// ── Site-specific eval formatting (legacy-faithful, see module doc) ────────
function candidateEval(lf: LineFact): string {
  const e = lf.eval;
  // C5: the builder already flagged client-timeout lines and precomputed the
  // honest rendering. Reading cp/mate directly published "+0.00" for a line
  // the engine never scored.
  if (e.sentinel) return "engine data unavailable";
  if (e.mate !== null) return `M${e.mate > 0 ? "+" : ""}${e.mate}`;
  if (e.cp !== null) return `${e.cp >= 0 ? "+" : ""}${(e.cp / 100).toFixed(2)}`;
  return "?";
}

function flatEvalStr(flat: number): string {
  return Math.abs(flat) >= 9000 ? (flat > 0 ? "M+" : "M-") : (flat / 100).toFixed(2);
}

/**
 * Candidate ranking gap — verbatim semantics of the legacy computeCandidateGap
 * (route-local until PR-CI-1), operating on LineFacts.
 */
function computeCandidateGap(lines: LineFact[]): string {
  if (lines.length < 2) return "Only one candidate line available.";
  const e1 = lines[0].eval;
  const e2 = lines[1].eval;
  const eval1 = e1.mate !== null ? (e1.mate > 0 ? 9999 : -9999) : (e1.cp ?? 0);
  const eval2 = e2.mate !== null ? (e2.mate > 0 ? 9999 : -9999) : (e2.cp ?? 0);
  const gap = Math.abs(eval1 - eval2);
  const gapStr = (gap / 100).toFixed(2);
  const severity = gap >= 300 ? "CRITICAL JUNCTION" : gap >= 100 ? "IMPORTANT CHOICE" : "CLOSE ALTERNATIVES";
  return `${severity} — gap between #1 and #2 candidate: ${gapStr} pawns`;
}

/** Pedagogical-concept block — verbatim template of the legacy buildConceptLayer. */
function renderConceptBlock(concepts: ConceptFact[]): string {
  if (concepts.length === 0) return "";
  const lines: string[] = [];
  for (const c of concepts) {
    lines.push(
      `- ${c.name} (${c.tier}, confidence ${c.confidence.toFixed(2)})\n    Definition: ${c.definition}\n    Evidence: ${c.evidence}`,
    );
  }
  return lines.join("\n");
}

/**
 * Teaching spine — verbatim template of the legacy buildTeachingSpine, fed
 * from the contract's featureDelta + threats (null = the legacy computation
 * threw, which skipped the whole spine).
 */
function renderTeachingSpine(delta: PositionFeatureDelta | null, threats: ThreatNode[] | null): string {
  if (delta === null || threats === null) return "";
  const lines: string[] = [];

  if (!delta.isEmptyDelta) {
    const deltaBits: string[] = [];

    const matW = delta.materialDelta.white;
    const matB = delta.materialDelta.black;
    if (matW !== 0 || matB !== 0) {
      const net = matB - matW; // >0 means Black gained relative to White
      const side = net > 0 ? "Black" : "White";
      deltaBits.push(`material swung ~${Math.abs(net)} point(s) toward ${side}`);
    }

    const hung = delta.hangingPiecesDelta.newlyHanging;
    if (hung.length) {
      deltaBits.push(
        `now hanging: ${hung
          .slice(0, 2)
          .map((h) => `${h.color} ${h.piece} on ${h.square}`)
          .join(", ")}`,
      );
    }

    const newThreats = delta.threatsDelta.newThreats;
    if (newThreats.length) {
      deltaBits.push(
        `new threat(s): ${newThreats
          .slice(0, 2)
          .map((t) => t.description)
          .join("; ")}`,
      );
    }

    const ksW = delta.kingSafetyDelta.white;
    const ksB = delta.kingSafetyDelta.black;
    if (ksW < 0 || ksB < 0) {
      const worse = ksW < ksB ? "White" : "Black";
      deltaBits.push(`${worse}'s king safety dropped`);
    }

    const trapped = delta.pieceActivityDelta.newlyTrapped;
    if (trapped.length) {
      deltaBits.push(
        `newly trapped: ${trapped
          .slice(0, 1)
          .map((p) => `${p.color} ${p.piece} on ${p.square}`)
          .join(", ")}`,
      );
    }

    if (deltaBits.length) {
      lines.push(`CONCEPT DELTA (what the move changed): ${deltaBits.slice(0, 2).join(" | ")}`);
    }
  }

  if (threats.length) {
    const threatBits = threats.slice(0, 3).map((t) => {
      const tag = t.isMate ? "MATE" : t.isCheck ? "check" : `wins ~${Math.round(t.approxMaterialGainCp / 100)}p`;
      return `${t.threatSan} (${tag})`;
    });
    lines.push(`OPPONENT THREATS TO COUNT: ${threatBits.join(", ")}`);
  }

  return lines.join("\n");
}

function renderMoveByMoveLine(e: CoachContract["moveTable"][number]): string {
  const moveLabel = e.color === "w" ? `${e.moveNumber}.` : `${e.moveNumber}...`;
  const colorWord = e.color === "w" ? "White" : "Black";
  let line = `${moveLabel} ${e.san} (${colorWord})`;

  if (e.changeDescription) {
    line += ` | ${e.changeDescription}`;
  }

  line += `\n    FEN before: ${e.fenBefore}`;
  line += `\n    FEN after:  ${e.fenAfter}`;

  // C3 (SILENT_SUBSTITUTION_HANDOFF): this used to render unconditionally,
  // three lines above "Eval: engine data unavailable" — the same block
  // asserting both that the engine never scored the move and that the move was
  // a BLUNDER. The classification is derived from the eval, so when the eval
  // is a timeout sentinel (or absent entirely) the label has no basis.
  //
  // This one is load-bearing beyond the prompt: the output referee validates
  // coach prose against the contract, so a fabricated classification HERE is
  // reported as a *backed* claim. The referee cannot catch it; only this guard can.
  if (e.classification && e.evalAfter && !e.evalAfter.sentinel) {
    line += `\n    Classification: ${e.classification.toUpperCase()}`;
  }

  if (e.evalAfter) {
    const f = e.evalAfter;
    if (f.sentinel) {
      // Client-side timeout sentinel ({cp: 0, depth: 0}) — NOT a real 0.00.
      line += `\n    Eval: engine data unavailable for this move (analysis timed out)`;
    } else if (f.mate !== null) {
      line += `\n    Eval: M${f.mate > 0 ? "+" : ""}${f.mate}`;
    } else if (f.cp !== null) {
      const pawns = (f.cp / 100).toFixed(2);
      line += `\n    Eval: ${f.cp >= 0 ? "+" : ""}${pawns}`;
    }
  }

  if (e.bestWas) {
    if (e.bestWas.line) {
      const le = e.bestWas.line.eval;
      const pvEvalStr =
        le.mate !== null
          ? `M${le.mate > 0 ? "+" : ""}${le.mate}`
          : le.cp !== null
            ? `${le.cp >= 0 ? "+" : ""}${(le.cp / 100).toFixed(2)}`
            : "";
      const fullPvLine = formatPvAsMoveList(e.bestWas.line.san, e.moveNumber, e.ply % 2 === 0);
      // C5: naming the better move is still useful; attaching "(+0.00, depth 0)"
      // to it is a fabricated engine score for a line that was never searched.
      line += le.sentinel
        ? `\n    Best was: ${e.bestWas.san} (engine data unavailable) — Engine line: ${fullPvLine}`
        : `\n    Best was: ${e.bestWas.san} (${pvEvalStr}, depth ${le.depth}) — Engine line: ${fullPvLine}`;
    } else {
      line += `\n    Best was: ${e.bestWas.san}`;
    }
  }

  return line;
}

function renderTopMistake(m: InsightContract): string {
  const severity =
    m.severityDropCp >= 300 ? "BLUNDER" : m.severityDropCp >= 150 ? "MISTAKE" : m.severityDropCp >= 50 ? "INACCURACY" : "MINOR";
  const evalBeforeStr = flatEvalStr(m.cpBeforeFlat);
  const evalAfterStr = flatEvalStr(m.cpAfterFlat);
  let line = `### Move ${m.moveNumber} (${m.colorName}): ${m.playedSan} [${severity}]`;
  line += `\n  Eval: ${evalBeforeStr} → ${evalAfterStr} (lost ${(m.severityDropCp / 100).toFixed(1)} pawns)`;
  if (m.changeDescription) line += `\n  What happened: ${m.changeDescription}`;
  line += `\n  FEN before: ${m.fenBefore}`;

  if (m.lines.length > 0) {
    line += `\n  ${m.groundingContext}`;
    line += `\n  ${computeCandidateGap(m.lines)}`;

    if (m.branchPoint) {
      const bp = m.branchPoint;
      const sharedLine = bp.atPly > 0 ? `after ${bp.sharedSan.join(" ")} — ` : "";
      line += `\n  BRANCH POINT: Lines diverge at move ${bp.atPly + 1}. ${sharedLine}Best continues ${bp.bestContinues}, played line goes ${bp.playedGoes}`;
    }

    line += `\n  CANDIDATE MOVES (from Stockfish, best first):`;
    for (const lf of m.lines) {
      if (lf.pvUci.length === 0) continue;
      const firstMove = lf.san.length > 0 ? lf.san[0] : lf.pvUci[0];
      const isPlayed = firstMove === m.playedSan;
      const fullLine = formatPvAsMoveList(lf.san, m.moveNumber, m.ply % 2 === 0);
      line += `\n    ${isPlayed ? "⮕ PLAYED" : "★ BETTER"}: ${firstMove} (${candidateEval(lf)}) — Line: ${fullLine} (depth ${lf.eval.depth})`;
    }
  }

  line += `\n  Best move was: ${m.bestSan ?? "N/A"}`;

  return line;
}

function renderIntelligenceBlock(m: InsightContract): string {
  const severity = m.severityDropCp >= 300 ? "BLUNDER" : m.severityDropCp >= 150 ? "MISTAKE" : "INACCURACY";

  let block = `### CRITICAL POSITION: Move ${m.moveNumber} (${m.colorName} — ${severity})\n`;
  block += `${m.groundingContext}\n`;
  block += `CANDIDATE RANKING: ${computeCandidateGap(m.lines)}\n`;

  if (m.intelBranchPoint) {
    const bp = m.intelBranchPoint;
    const shared = bp.sharedCount > 0 ? `Shared first ${bp.sharedCount} move(s): ${bp.sharedSan.join(" ")}. ` : "";
    block += `BRANCH POINT: ${shared}Key divergence — best: ${bp.bestContinues ?? "?"} vs alternative: ${bp.altContinues ?? "?"}\n`;
  }

  const conceptBlock = renderConceptBlock(m.concepts);
  if (conceptBlock) {
    block += `PEDAGOGICAL CONCEPTS (teach by name — this is the principle the student missed):\n${conceptBlock}\n`;
  }

  if (m.engineIdea) block += `ENGINE IDEA: ${m.engineIdea}\n`;

  if (m.relational !== null) {
    block += `VERIFIED POSITION FACTS (chess.js oracle — only assert relationships listed here):\n${m.relational.summary}\n`;
  }

  const spine = renderTeachingSpine(m.featureDelta, m.threats);
  if (spine) {
    block += `GROUNDED TEACHING SPINE (what the move changed + threats to count):\n${spine}\n`;
  }

  return block;
}

/**
 * Render the legacy buildGameContext prompt text from the contract.
 * Section order, headers, separators, and every conditional mirror the
 * pre-contract implementation exactly.
 */
export function renderLegacyPrompt(contract: CoachContract): string {
  const g = contract.game;
  const sections: string[] = [];

  // --- Game overview ---
  let overview = `## GAME OVERVIEW\n`;
  if (g.historyTruncated) {
    overview += `- ⚠️ NOTE: the move record could not be fully replayed — analysis covers the first ${Math.ceil(g.replayedPlies / 2)} moves (ply ${g.replayedPlies} of ${g.totalHalfMoves}). Do NOT comment on moves after this point or describe this as the final position of a completed game.\n`;
  }
  overview += `- Total moves: ${g.moveCount} full moves (${g.totalHalfMoves} half-moves)\n`;
  overview += `- Result: ${g.resultText}\n`;
  if (g.username) overview += `- Player: ${g.username} playing as ${g.playerColor === "w" ? "White" : "Black"}\n`;
  if (g.userRating) overview += `- Player rating: ${g.userRating}\n`;
  if (g.accuracy) overview += `- Accuracy: White ${g.accuracy.white.toFixed(1)}%, Black ${g.accuracy.black.toFixed(1)}%\n`;
  if (g.estimatedElo) overview += `- Estimated Elo: White ~${g.estimatedElo.white}, Black ~${g.estimatedElo.black}\n`;
  const h = g.pgnHeaders;
  if (h.white) overview += `- White: ${h.white}${h.whiteElo ? ` (${h.whiteElo})` : ""}\n`;
  if (h.black) overview += `- Black: ${h.black}${h.blackElo ? ` (${h.blackElo})` : ""}\n`;
  if (h.event) overview += `- Event: ${h.event}\n`;
  if (h.date) overview += `- Date: ${h.date}\n`;
  if (h.timeControl) overview += `- Time control: ${h.timeControl}\n`;
  if (h.opening || h.eco) {
    const parts = [h.opening, h.eco ? `ECO ${h.eco}` : null].filter(Boolean);
    overview += `- Opening: ${parts.join(", ")}\n`;
  }
  if (h.result && h.result !== "*") overview += `- PGN result tag: ${h.result}\n`;
  sections.push(overview);

  // --- PGN ---
  sections.push(`## PGN\n${buildPgnFromMoves(g.moveHistory)}`);

  // --- Move-by-move + mistakes ---
  if (g.hasGameEval) {
    const moveLines = contract.moveTable.map(renderMoveByMoveLine);
    sections.push(
      `## MOVE-BY-MOVE ANALYSIS (with Stockfish evaluations)\nAll evals are in pawns from White's perspective (positive = better for White); M+n / M-n = forced mate for White / Black.\n${moveLines.join("\n")}`,
    );

    const topMistakes = contract.insights
      .filter((i) => i.topMistakeRank !== null)
      .sort((a, b) => a.topMistakeRank! - b.topMistakeRank!);
    if (topMistakes.length > 0) {
      const mistakeLines = topMistakes.map(renderTopMistake);
      sections.push(`## TOP MISTAKES (sorted by severity — ANALYZE EACH WITH FULL DEPTH)\n${mistakeLines.join("\n\n")}`);
    } else {
      sections.push(`## MISTAKES\nNo significant mistakes detected (all moves within 0.5 pawn of engine best).`);
    }
  } else {
    sections.push(
      `## NOTE: No Stockfish evaluation data available. The game has not been engine-analyzed yet. Analyze the position and moves based on general chess principles.`,
    );
  }

  // --- Final position ---
  sections.push(`## FINAL POSITION\nFEN: ${g.finalFen}\n${g.finalMaterial}`);

  if (contract.finalAnnotation !== null) {
    sections.push(contract.finalAnnotation);
  }

  if (contract.finalRelational !== null) {
    sections.push(
      `## VERIFIED POSITION FACTS — FINAL POSITION (chess.js oracle)\n${contract.finalRelational.summary}`,
    );
  }

  // --- Chess Intelligence Layer ---
  const intel = contract.insights
    .filter((i) => i.intelligenceRank !== null)
    .sort((a, b) => a.intelligenceRank! - b.intelligenceRank!);
  if (intel.length > 0) {
    const intelligenceLines = intel.map(renderIntelligenceBlock);
    if (intelligenceLines.length > 0) {
      sections.push(
        `## CHESS INTELLIGENCE LAYER\n(Pre-computed verified analysis — use this to ground your explanations)\n\n${intelligenceLines.join("\n")}`,
      );
    }
  }

  return sections.join("\n\n");
}

// ── Canonical serialization ─────────────────────────────────────────────────
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

// ── Model-facing projection (prompt cost) ───────────────────────────────────
/**
 * The contract JSON is the largest UNCACHED block of a flagship review. Only
 * the FIRST system block carries cache_control (llmProvider.ts), and the
 * contract rides in the user turn, so every byte here is billed at full input
 * price on every single review.
 *
 * The projection below removes encoding redundancy the VERBALIZER CHARTER
 * already forbids the model from using — and nothing else. The CoachContract
 * OBJECT is left untouched, which is what makes this safe: the referee, the
 * san_whitelist square pool (collectContractWhitelist reads moveTable FENs and
 * is armed at `error`), and renderLegacyPrompt all read the object, never this
 * string. Removals live HERE and must never migrate into the builder or types.
 *
 * Each removal, and the rule that licenses it:
 *  - EvalFact.provenance, and the raw `cp` / `mate` / `depth` beside it — the
 *    charter orders eval figures copied verbatim from `display` and forbids
 *    computing, rounding or inventing one, so the raw numbers are unusable by
 *    construction; depth is already in evalIntegrity.minDepth. This is also a
 *    correctness fix, not only a cost one: a sentinel eval carries the
 *    "flagged, not forged" {cp: 0, depth: 0} beside a display reading "engine
 *    data unavailable", so we were showing the model a zero the charter then
 *    had to forbid it from printing. Removing it beats policing it in prose.
 *    `display` + `sentinel` remain — every eval fact the model may assert.
 *  - pvUci beside a `san` array — UCI is never sayable (MOVE-NAMING
 *    DISCIPLINE admits SAN only), so shipping it can only invite a
 *    mis-transcription. The legacy renderer's pvUci[0] fallback reads the
 *    object, so it keeps working.
 *  - moveTable[i].fenBefore when it equals moveTable[i-1].fenAfter — pure
 *    chain redundancy. Row 0 keeps its fenBefore; nothing precedes it.
 *  - featureDelta branches that are entirely empty arrays / zeroes —
 *    `isEmptyDelta` already carries that signal.
 *
 * The last two are conventions, so the charter states both explicitly: an
 * absent branch means "no change", never "unknown".
 */

/**
 * EvalFact is the only shape carrying `display` + `sentinel` + `provenance`.
 * Grounded<T> sources (chessdb/lc0/maia/syzygy) carry `status`/`value` and
 * KEEP their provenance — the charter grades hedging on those.
 */
/**
 * What an EvalFact sheds on the wire. `display` is the canonical rendering the
 * verbalizer copies verbatim; `sentinel` is the flag the guard logic reads.
 * Everything else is the raw form the charter forbids the model from using.
 */
const EVAL_WIRE_DROP = new Set(["provenance", "cp", "mate", "depth"]);

function isEvalFactShape(v: Record<string, unknown>): boolean {
  return (
    typeof v.display === "string" &&
    typeof v.sentinel === "boolean" &&
    "provenance" in v
  );
}

/** No information: empty arrays, zeroes, and objects made only of those. */
function isVacantBranch(v: unknown): boolean {
  if (Array.isArray(v)) return v.length === 0;
  if (v !== null && typeof v === "object") {
    const vals = Object.values(v as Record<string, unknown>);
    return vals.length > 0 && vals.every(isVacantBranch);
  }
  return v === 0;
}

/** Drop vacant branches at every depth of a feature delta. */
function pruneVacant(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isVacantBranch(v)) continue;
    out[k] = pruneVacant(v);
  }
  return out;
}

function projectNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectNode);
  if (value === null || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isEvalFactShape(obj) && EVAL_WIRE_DROP.has(k)) continue;
    if (k === "pvUci" && Array.isArray(obj.san)) continue;
    // A line's story reaches the model as one sentence per ply ("s2 8.Nc7+ —
    // gives check; forks …") plus the material ledger — the structured facts
    // stay referee-side. Empty stories are dropped: absence is never
    // uncertainty in this encoding (see the charter's READING THE CONTRACT).
    if (k === "story" && Array.isArray(obj.san) && v && typeof v === "object") {
      const story = v as LineStory;
      if (story.plies.length === 0) continue;
      out.story = projectLineStory(story);
      continue;
    }
    if (k === "featureDelta") {
      out[k] = projectNode(pruneVacant(v));
      continue;
    }
    out[k] = projectNode(v);
  }
  return out;
}

/** Drop each row's fenBefore when the previous row's fenAfter already states it. */
function projectMoveTable(rows: readonly MoveTableEntry[]): unknown[] {
  return rows.map((row, i) => {
    const prev = i > 0 ? rows[i - 1] : undefined;
    if (prev && row.fenBefore !== null && row.fenBefore === prev.fenAfter) {
      const { fenBefore: _fenBefore, ...rest } = row;
      return rest;
    }
    return row;
  });
}

/**
 * Canonical sorted-key JSON of the contract with timestamp fields stripped
 * (builtAtMs/buildMs vary per request and would defeat both hashing and the
 * Anthropic prompt-cache prefix). Shadow-logging size source today; the CI-4
 * verbalizer user turn later.
 */
export function serializeForVerbalizer(contract: CoachContract): string {
  // `intent` is stripped for the same reason as builtAtMs/buildMs: it is
  // telemetry, not a sayable fact. Because this function spreads ...rest, an
  // un-stripped field would silently enter the verbalizer prompt, change its
  // cache prefix, and break every byte-equality snapshot — so the omission is
  // asserted directly in serialize's tests rather than left to review.
  const { builtAtMs: _builtAtMs, buildMs: _buildMs, intent: _intent, ...rest } = contract;
  // PRECISION PACK fix 4: motifLicense is a REFEREE license pool, not a
  // sayable fact — stripping it keeps the verbalizer prompt (and its cache
  // prefix) byte-identical to pre-precision-pack contracts.
  // The game's own continuation rides under its own key, same string form as
  // a line's story: gameStory: { story: [...] }.
  const insights = rest.insights.map(({ motifLicense: _motifLicense, gameStory, ...ins }) => {
    if (!gameStory || gameStory.plies.length === 0) return ins;
    return { ...ins, gameStory: { story: projectLineStory(gameStory) } };
  });
  const moveTable = projectMoveTable(rest.moveTable);
  return JSON.stringify(
    sortKeysDeep(projectNode({ ...rest, insights, moveTable })),
  );
}

import { compute_feature_delta, type PositionFeatureDelta } from "@/lib/mastermind/featureDelta";
import { buildThreatTree } from "@/lib/mastermind/threatTree";
import {
  candidatesFromDelta,
  selectPrimaryIdea,
  type MasterySummary,
} from "@/lib/teaching/relevanceFilter";

/**
 * Shared fact-collection: the dominant concept-DELTA sub-facts the move
 * changed, as neutral human-readable phrases. Extracted so BOTH the
 * prompt-facing `buildTeachingSpine` and the user-facing
 * `buildTimeoutTeachingMessage` render from the SAME chess.js-derived facts —
 * they cannot drift or contradict. Order = teachability priority (material
 * first). Never dumps everything; caller slices.
 */
function collectDeltaBits(delta: PositionFeatureDelta): string[] {
  const deltaBits: string[] = [];

  // Material swing (the most teachable single fact).
  const matW = delta.materialDelta.white;
  const matB = delta.materialDelta.black;
  if (matW !== 0 || matB !== 0) {
    const net = matB - matW; // >0 means Black gained relative to White
    const side = net > 0 ? "Black" : "White";
    deltaBits.push(`material swung ~${Math.abs(net)} point(s) toward ${side}`);
  }

  // Pieces left hanging by the move (board-vision failures).
  const hung = delta.hangingPiecesDelta.newlyHanging;
  if (hung.length) {
    deltaBits.push(
      `now hanging: ${hung
        .slice(0, 2)
        .map((h) => `${h.color} ${h.piece} on ${h.square}`)
        .join(", ")}`
    );
  }

  // New threats the move conceded.
  const newThreats = delta.threatsDelta.newThreats;
  if (newThreats.length) {
    deltaBits.push(
      `new threat(s): ${newThreats
        .slice(0, 2)
        .map((t) => t.description)
        .join("; ")}`
    );
  }

  // King-safety degradation.
  const ksW = delta.kingSafetyDelta.white;
  const ksB = delta.kingSafetyDelta.black;
  if (ksW < 0 || ksB < 0) {
    const worse = ksW < ksB ? "White" : "Black";
    deltaBits.push(`${worse}'s king safety dropped`);
  }

  // A piece the move trapped.
  const trapped = delta.pieceActivityDelta.newlyTrapped;
  if (trapped.length) {
    deltaBits.push(
      `newly trapped: ${trapped
        .slice(0, 1)
        .map((p) => `${p.color} ${p.piece} on ${p.square}`)
        .join(", ")}`
    );
  }

  return deltaBits;
}

/**
 * Shared: the enumerated opponent checks/captures/threats from fenBefore, as
 * short `Nxe5 (wins ~3p)` / `Qh5 (MATE)` phrases. Used by both renderers.
 */
function collectThreatBits(fenBefore: string): string[] {
  const threats = buildThreatTree(fenBefore, 2);
  return threats.slice(0, 3).map((t) => {
    const tag = t.isMate
      ? "MATE"
      : t.isCheck
        ? "check"
        : `wins ~${Math.round(t.approxMaterialGainCp / 100)}p`;
    return `${t.threatSan} (${tag})`;
  });
}

/**
 * Phase-2 GROUNDED TEACHING SPINE (principle 8). For a single critical
 * position, render the top 1-2 non-empty concept-DELTAS the move changed plus
 * the enumerated opponent checks/captures/threats, so the LLM's "why" is
 * anchored to verified facts rather than synthesized. Pure-synchronous
 * (chess.js only). Returns "" when there is nothing grounded to say — callers
 * append nothing in that case. Callers wrap this in try/catch: both helpers
 * call `new Chess(fen)` and can throw InvalidFenError on edge FENs.
 *
 * Deliberately terse: emit only the dominant deltas + ≤3 threats, never the
 * full PositionFeatureDelta/ThreatNode trees (token-bloat / latency guard).
 *
 * Extracted from the enhanced-analysis route so the spine is unit-testable in
 * isolation (route.ts is ~2k lines and not vitest-importable as a unit).
 */
export function buildTeachingSpine(
  fenBefore: string,
  fenAfter: string,
  bestPvUci: string[],
  masterySummary?: MasterySummary | null
): string {
  const lines: string[] = [];

  // --- Concept DELTA: what the move actually changed ---
  const delta = compute_feature_delta(fenBefore, fenAfter, { pv: bestPvUci });

  // --- Phase-3 personalized primary idea (cross-game weakness memory) ---
  // When a mastery summary is supplied AND one of this move's concept-deltas
  // matches a recurring weakness, the relevance filter re-weights the primary
  // idea toward that weakness. Emit a directive line only when the memory
  // actually changed the choice — otherwise the cold ONE-PRIMARY-IDEA rule and
  // the CONCEPT DELTA below already carry it, and a redundant line just bloats.
  if (masterySummary) {
    const { primary, personalized } = selectPrimaryIdea(
      candidatesFromDelta(delta),
      masterySummary
    );
    if (primary && personalized) {
      lines.push(
        `PRIMARY IDEA (personalized — this move touches your recurring "${primary.category}" weakness): ${primary.text}`
      );
    }
  }
  if (!delta.isEmptyDelta) {
    // Top 1-2 dominant sub-deltas only — do not dump everything.
    const deltaBits = collectDeltaBits(delta);
    if (deltaBits.length) {
      lines.push(`CONCEPT DELTA (what the move changed): ${deltaBits.slice(0, 2).join(" | ")}`);
    }
  }

  // --- Opponent threats to COUNT (principle 6, 800-1200 band; principle 8) ---
  const threatBits = collectThreatBits(fenBefore);
  if (threatBits.length) {
    lines.push(`OPPONENT THREATS TO COUNT: ${threatBits.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * Phase-2 TIMEOUT TEACHING FALLBACK. When the Mastermind validation pipeline
 * blows its per-category deadline the route otherwise returns a dead stub
 * ("Still analyzing … ask again or rephrase") — a 0-teaching turn. But by that
 * point the deterministic, engine-grounded facts for the critical move are
 * already cheap to recompute (chess.js only, no LLM). This renders those SAME
 * facts as a SHORT, user-facing coaching turn: the one thing the move changed
 * plus the opponent replies to count.
 *
 * It COMPOSES with the truthfulness floor rather than bypassing it: every
 * sentence is derived from chess.js/Stockfish (compute_feature_delta +
 * buildThreatTree), so it cannot introduce a relational hallucination and needs
 * no further LLM validation. Returns "" when there is nothing grounded to say
 * (quiet move, degraded/position-only anchor where fenBefore === fenAfter) —
 * the caller then keeps the original stub.
 *
 * Deliberately minimal (≤~4 short sentences). This is a graceful-degradation
 * turn, not a replacement for the full coach.
 */
export function buildTimeoutTeachingMessage(
  fenBefore: string,
  fenAfter: string,
  bestPvUci: string[],
  moveSan?: string,
  masterySummary?: MasterySummary | null
): string {
  const delta = compute_feature_delta(fenBefore, fenAfter, { pv: bestPvUci });
  const deltaBits = delta.isEmptyDelta ? [] : collectDeltaBits(delta);
  const threatBits = collectThreatBits(fenBefore);

  // Nothing grounded to teach — let the caller keep the neutral stub.
  if (!deltaBits.length && !threatBits.length) return "";

  const parts: string[] = [];
  parts.push(
    "The deep-analysis pass is taking longer than usual, so here's the grounded version while it catches up:"
  );

  const moveLabel = moveSan ? `**${moveSan}**` : "that move";

  // Optional personalized framing — only when cross-game memory actually flips
  // the primary idea toward a recurring weakness (same gate as the spine).
  if (masterySummary) {
    const { primary, personalized } = selectPrimaryIdea(
      candidatesFromDelta(delta),
      masterySummary
    );
    if (primary && personalized) {
      parts.push(
        `This connects to your recurring **${primary.category}** weakness — ${primary.text}`
      );
    }
  }

  if (deltaBits.length) {
    parts.push(`What ${moveLabel} changed: ${deltaBits.slice(0, 2).join("; ")}.`);
  }

  if (threatBits.length) {
    parts.push(
      `Before you commit a move here, count your opponent's forcing replies: ${threatBits.join(", ")}.`
    );
  }

  parts.push("Ask again and I'll give you the full breakdown.");

  return parts.join("\n\n");
}

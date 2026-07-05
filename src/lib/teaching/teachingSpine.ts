import { compute_feature_delta } from "@/lib/mastermind/featureDelta";
import { buildThreatTree } from "@/lib/mastermind/threatTree";

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
  bestPvUci: string[]
): string {
  const lines: string[] = [];

  // --- Concept DELTA: what the move actually changed ---
  const delta = compute_feature_delta(fenBefore, fenAfter, { pv: bestPvUci });
  if (!delta.isEmptyDelta) {
    const deltaBits: string[] = [];

    // Material swing (the most teachable single fact).
    const matW = delta.materialDelta.white;
    const matB = delta.materialDelta.black;
    if (matW !== 0 || matB !== 0) {
      const net = matB - matW; // >0 means Black gained relative to White
      const side = net > 0 ? "Black" : "White";
      deltaBits.push(
        `material swung ~${Math.abs(net)} point(s) toward ${side}`
      );
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

    // Top 1-2 dominant sub-deltas only — do not dump everything.
    if (deltaBits.length) {
      lines.push(`CONCEPT DELTA (what the move changed): ${deltaBits.slice(0, 2).join(" | ")}`);
    }
  }

  // --- Opponent threats to COUNT (principle 6, 800-1200 band; principle 8) ---
  const threats = buildThreatTree(fenBefore, 2);
  if (threats.length) {
    const threatBits = threats.slice(0, 3).map((t) => {
      const tag = t.isMate ? "MATE" : t.isCheck ? "check" : `wins ~${Math.round(t.approxMaterialGainCp / 100)}p`;
      return `${t.threatSan} (${tag})`;
    });
    lines.push(`OPPONENT THREATS TO COUNT: ${threatBits.join(", ")}`);
  }

  return lines.join("\n");
}

/**
 * INSIGHT-block grammar — shared constants + parse/render (PR-CI-3).
 *
 * One grammar, three consumers, zero duplicated regexes (plan risk #5):
 *   - the client parser (AICoachInsights.parser.ts) — the shipping consumer;
 *     its header field order is the source of truth (mirrors
 *     coachChatPrompt.ts "INSIGHT BLOCK FORMAT"). It stays untouched (shared
 *     client component), but the render↔parse round-trip test pins THIS
 *     module against it so the two cannot drift silently.
 *   - the streaming block gate (blockGate.ts) — boundary detection only.
 *   - the referee (referee.ts / shadowReferee.ts) — header→InsightContract
 *     anchoring.
 *
 * renderInsightHeader is the CI-4 "server-authoritative header" primitive:
 * the header is derived from the InsightContract, never trusted from the
 * model. In CI-3 it exists for the round-trip test (grammar-drift guard);
 * CI-4 wires it into block rewriting.
 */
import type { CoachContract, InsightContract } from "./types";

/** Opening marker up to (not including) the header fields. Case-sensitive —
 * the canonical grammar the prompt dictates; the client parser is lenient
 * (case-insensitive open) as belt-and-suspenders, the server side is strict. */
export const INSIGHT_OPEN_PREFIX = "[INSIGHT:";
export const INSIGHT_CLOSE_TOKEN = "[/INSIGHT]";

/** Header fields per coachChatPrompt.ts INSIGHT BLOCK FORMAT (strict):
 * [INSIGHT:moveNumber:color:classification:evalBefore:evalAfter:playedMove:bestMove] */
export interface InsightHeaderFields {
  moveNumber: number;
  color: "w" | "b";
  classification: string;
  evalBefore: string;
  evalAfter: string;
  playedMove: string;
  /** May be absent — the client parser tolerates ≥6 fields. */
  bestMove?: string;
}

/**
 * Parse the raw header text (between "[INSIGHT:" and the closing "]").
 * Field rules mirror AICoachInsights.parser.ts parseOneInsight EXACTLY:
 * ≥6 trimmed fields, finite moveNumber, color w|b (case-insensitive),
 * non-empty classification and playedMove; bestMove re-joins any extra
 * colon-separated tail. Returns null on malformed headers (the client drops
 * those cards; the referee logs them as header fabrications).
 */
export function parseInsightHeader(headerRaw: string): InsightHeaderFields | null {
  const parts = headerRaw.split(":").map((s) => s.trim());
  if (parts.length < 6) return null;
  const moveNumber = Number.parseInt(parts[0], 10);
  const color = parts[1].toLowerCase();
  const classification = parts[2].toLowerCase();
  const evalBefore = parts[3];
  const evalAfter = parts[4];
  const playedMove = parts[5];
  const bestMove = parts.slice(6).join(":").trim() || undefined;
  if (!Number.isFinite(moveNumber)) return null;
  if (color !== "w" && color !== "b") return null;
  if (!classification) return null;
  if (!playedMove) return null;
  return { moveNumber, color, classification, evalBefore, evalAfter, playedMove, bestMove };
}

/** Header eval field: EvalFact.display when present, "?" otherwise (display
 * is "" only when the position carried no numeric eval at all). display
 * never contains ":" or "]", so the field is grammar-safe by construction. */
function headerEval(display: string): string {
  return display !== "" ? display : "?";
}

/**
 * Render the server-authoritative header line from an InsightContract.
 * bestMove falls back to playedSan when the contract has no engine best
 * (the prompt instructs the model to repeat playedMove in that case).
 */
export function renderInsightHeader(insight: InsightContract): string {
  const fields = [
    String(insight.moveNumber),
    insight.color,
    insight.classification,
    headerEval(insight.evalBefore.display),
    headerEval(insight.evalAfter.display),
    insight.playedSan,
    insight.bestSan ?? insight.playedSan,
  ];
  return `${INSIGHT_OPEN_PREFIX}${fields.join(":")}]`;
}

/** Render a complete block: header line + body + close token. */
export function renderInsightBlock(insight: InsightContract, body: string): string {
  return `${renderInsightHeader(insight)}\n${body}\n${INSIGHT_CLOSE_TOKEN}`;
}

/**
 * Anchor a parsed header to its InsightContract: moveNumber + color identify
 * the ply uniquely within a game. Returns the match plus whether the header's
 * playedMove agrees with the contract (a mismatch is itself a header-
 * fabrication signal the shadow referee logs — the contract stays the anchor).
 */
export function matchInsightForHeader(
  fields: InsightHeaderFields,
  contract: CoachContract,
): { insight: InsightContract; playedSanMatches: boolean } | null {
  const insight = contract.insights.find(
    (i) => i.moveNumber === fields.moveNumber && i.color === fields.color,
  );
  if (!insight) return null;
  return { insight, playedSanMatches: insight.playedSan === fields.playedMove };
}

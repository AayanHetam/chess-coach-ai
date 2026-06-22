/**
 * Pure (no LLM, no engine) parser for the coach's INSIGHT-card response format.
 *
 * The real product coach (src/lib/prompts/coachChatPrompt.ts:273-343) emits a
 * very short prose intro followed by one [INSIGHT:...]...[/INSIGHT] block per
 * key move. This module splits that text into:
 *   - fullGameAnalysis: the intro prose BEFORE the first [INSIGHT (the "overall"
 *     review unit a human rates on its own), plus any trailing prose after the
 *     last [/INSIGHT].
 *   - insights[]: one ParsedInsight per [INSIGHT] block.
 *
 * The header split + validation logic mirrors the production React parser at
 * src/components/AICoachInsights.parser.ts:78-101 EXACTLY (same `parts.length
 * >= 6` guard, same color/classification/finite checks, same
 * `parts.slice(6).join(":")` bestMove handling) so the calibration view is
 * faithful to what users actually see. A vitest snapshot
 * (coachInsights.test.ts) cross-checks the two on real coachText samples.
 *
 * This file is Node-side (imported by tsx scripts + vitest). It deliberately
 * does NOT import the React parser, which would drag JSX through the script.
 */

export interface ParsedInsight {
  moveNumber: number;
  color: "w" | "b";
  classification: string;
  evalBefore: string;
  evalAfter: string;
  movePlayedSan: string;
  bestMoveSan: string;
  /** Headline — the non-spoiler lede after the opening marker, tags stripped. */
  description: string;
  /** Full [WHY] body (Idea/Problem/Solution/Outcome), control markers stripped. */
  why: string;
}

export interface ParsedCoachResponse {
  /** Prose outside any [INSIGHT] block — the overall game review. */
  fullGameAnalysis: string;
  insights: ParsedInsight[];
}

/**
 * Coach control tags that read as gibberish to a human rater. Mirrors (and
 * slightly extends) CONTROL_TAG_RE in calibrationExport.ts — kept in sync there
 * for the React page. We keep a local copy so this module has no dependency on
 * the @/ alias (which tsx scripts can't resolve without extra config).
 *
 * Extended vs. the original: adds ROLES (was missing) so [ROLES]…[/ROLES]
 * markers don't leak into rated prose.
 */
const CONTROL_TAG_RE =
  /\[\/?(?:INSIGHT|WHY|CONTINUATION|MAIA_CONTINUATION|THREATS|ROLES|CONCEPT|ENGINE_LINE|MOVE|BOARD|EVAL|PRACTICE)[^\]]*\]/g;

/** Strip control tags + collapse the blank lines they leave behind. */
export function stripControlTags(text: string): string {
  return text
    .replace(CONTROL_TAG_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const OPEN_RE = /\[INSIGHT:([^\]]+)\]/i;
const CLOSE_TOKEN = "[/INSIGHT]";

export function parseCoachInsights(coachText: string): ParsedCoachResponse {
  const raw = coachText ?? "";
  const insights: ParsedInsight[] = [];
  let cursor = 0;
  let firstOpen = -1;
  let lastClose = -1;

  while (cursor < raw.length) {
    const rest = raw.slice(cursor);
    const m = OPEN_RE.exec(rest);
    if (!m) break;
    const absOpen = cursor + m.index;
    if (firstOpen < 0) firstOpen = absOpen;
    const bodyStart = absOpen + m[0].length;
    const closeIdx = raw.indexOf(CLOSE_TOKEN, bodyStart);
    if (closeIdx < 0) break; // unclosed (likely truncated) — stop parsing.
    const body = raw.slice(bodyStart, closeIdx);
    const parsed = parseOneInsight(m[1], body);
    if (parsed) insights.push(parsed);
    cursor = closeIdx + CLOSE_TOKEN.length;
    lastClose = cursor;
  }

  if (insights.length === 0) {
    return { fullGameAnalysis: raw.trim(), insights: [] };
  }

  // fullGameAnalysis = the prose before the first insight, plus any trailing
  // prose after the last [/INSIGHT] (the prompt forbids a closing paragraph,
  // but we keep it if present so nothing is silently dropped).
  const prefix = raw.slice(0, firstOpen).trim();
  const suffix = raw.slice(lastClose).trim();
  const fullGameAnalysis = [prefix, suffix].filter(Boolean).join("\n\n");
  return { fullGameAnalysis, insights };
}

function parseOneInsight(header: string, body: string): ParsedInsight | null {
  // header: moveNumber:color:classification:evalBefore:evalAfter:playedMove:bestMove
  // Mirror AICoachInsights.parser.ts:89-101 exactly.
  const parts = header.split(":").map((s) => s.trim());
  if (parts.length < 6) return null;
  const moveNumber = parseInt(parts[0], 10);
  const color = parts[1].toLowerCase();
  const classification = parts[2].toLowerCase();
  const evalBefore = parts[3];
  const evalAfter = parts[4];
  const playedMove = parts[5];
  const bestMove = parts.slice(6).join(":").trim();
  if (!Number.isFinite(moveNumber)) return null;
  if (color !== "w" && color !== "b") return null;
  if (!classification) return null;
  if (!playedMove) return null;

  // [WHY] body, control markers ([CONTINUATION]/[MAIA_CONTINUATION]) stripped.
  const whyRaw = extractSection(body, "WHY") ?? "";
  const why = stripControlTags(whyRaw);

  // Headline = body with every tagged section removed.
  let headline = body;
  ["WHY", "THREATS", "ROLES", "CONCEPT", "ENGINE_LINE"].forEach((tag) => {
    const stripRe = new RegExp(
      `\\[${tag}(?::[^\\]]*)?\\][\\s\\S]*?\\[/${tag}\\]`,
      "gi"
    );
    headline = headline.replace(stripRe, "");
  });
  headline = stripControlTags(headline);

  return {
    moveNumber,
    color: color as "w" | "b",
    classification,
    evalBefore,
    evalAfter,
    movePlayedSan: playedMove,
    bestMoveSan: bestMove,
    description: headline,
    why,
  };
}

/** Return the inner body of [TAG]…[/TAG] (first occurrence), or null. */
function extractSection(body: string, tag: string): string | null {
  const open = new RegExp(`\\[${tag}(?::[^\\]]*)?\\]`, "i");
  const close = new RegExp(`\\[/${tag}\\]`, "i");
  const mo = open.exec(body);
  if (!mo) return null;
  const after = body.slice(mo.index + mo[0].length);
  const mc = close.exec(after);
  if (!mc) return null;
  return after.slice(0, mc.index).trim();
}

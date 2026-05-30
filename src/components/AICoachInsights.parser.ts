// Pure-TS extraction of the INSIGHT-block parser so it can be unit-tested
// without dragging the React/JSX surface of AICoachInsights.tsx through
// vitest. The parent component re-exports `parseInsights` + `InsightData`
// so existing callers (AnalysisImpl, AICoachChat) don't need to change
// import paths.

export interface InsightData {
  moveLabel: string; // e.g. "12." or "12..."
  moveNumber: number;
  color: "w" | "b";
  playedMove: string; // e.g. "g5"
  classification: string; // blunder | mistake | inaccuracy | brilliant | great | miss | best
  evalBefore?: string;
  evalAfter?: string;
  bestMove?: string;
  headline: string; // short 1-2 sentence non-spoiler lede
  why?: string; // full idea → problem → solution → outcome
  threats?: string;
  roles?: string;
  conceptKey?: string; // TACTICAL_THEMES key for the practice button
  conceptName?: string; // display label
  conceptBody?: string;
  engineLine?: string; // may include [CONTINUATION:X:c] / [MAIA_CONTINUATION:X:c] markers
}

// Robustly extract [INSIGHT:...]...[/INSIGHT] blocks from a message body.
// Format (mirrors coachChatPrompt.ts:285 — the source of truth for what
// the LLM is instructed to emit):
//   [INSIGHT:moveNumber:color:classification:evalBefore:evalAfter:playedMove:bestMove]
//   Headline text (no spoilers).
//   [WHY] idea/problem/solution/outcome [/WHY]
//   [THREATS] ... [/THREATS]
//   [ROLES]   ... [/ROLES]
//   [CONCEPT:themeKey:displayName] body [/CONCEPT]
//   [ENGINE_LINE] ... [/ENGINE_LINE]
//   [/INSIGHT]
export function parseInsights(raw: string): {
  prefix: string;
  insights: InsightData[];
  suffix: string;
} {
  const openRe = /\[INSIGHT:([^\]]+)\]/i;
  const closeToken = "[/INSIGHT]";
  const insights: InsightData[] = [];
  let cursor = 0;
  let firstOpen = -1;
  let lastClose = -1;

  while (cursor < raw.length) {
    const rest = raw.slice(cursor);
    const m = openRe.exec(rest);
    if (!m) break;
    const absOpen = cursor + m.index;
    if (firstOpen < 0) firstOpen = absOpen;
    const bodyStart = absOpen + m[0].length;
    const closeIdx = raw.indexOf(closeToken, bodyStart);
    if (closeIdx < 0) {
      // Unclosed block (likely still streaming) — stop parsing.
      break;
    }
    const body = raw.slice(bodyStart, closeIdx);
    const parsed = parseOneInsight(m[1], body);
    if (parsed) insights.push(parsed);
    cursor = closeIdx + closeToken.length;
    lastClose = cursor;
  }

  if (insights.length === 0) {
    return { prefix: raw, insights: [], suffix: "" };
  }
  return {
    prefix: raw.slice(0, firstOpen).trim(),
    insights,
    suffix: raw.slice(lastClose).trim(),
  };
}

function parseOneInsight(header: string, body: string): InsightData | null {
  // header: moveNumber:color:classification:evalBefore:evalAfter:playedMove:bestMove
  //
  // We require at least 6 fields so playedMove is present (it's what becomes
  // the clickable move reference in the card). bestMove can be empty — the
  // prompt asks the model to repeat playedMove when the move played was the
  // best, but lenience there is fine; the card still renders meaningfully.
  // Anything fewer than 6 fields means the model emitted a malformed header
  // (we've seen this from truncation on max_tokens hits and from the model
  // occasionally collapsing to [INSIGHT:12:w:blunder]); rendering a half-
  // populated card is worse than dropping it.
  const parts = header.split(":").map((s) => s.trim());
  if (parts.length < 6) return null;
  const moveNumber = parseInt(parts[0], 10);
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

  const moveLabel = color === "b" ? `${moveNumber}...` : `${moveNumber}.`;

  // Extract tagged sections from body
  const extract = (tag: string): { body: string; attrs: string[] } | null => {
    const open = new RegExp(`\\[${tag}(?::([^\\]]*))?\\]`, "i");
    const close = new RegExp(`\\[/${tag}\\]`, "i");
    const mo = open.exec(body);
    if (!mo) return null;
    const after = body.slice(mo.index + mo[0].length);
    const mc = close.exec(after);
    if (!mc) return null;
    return {
      body: after.slice(0, mc.index).trim(),
      attrs: (mo[1] ?? "").split(":").map((s) => s.trim()).filter(Boolean),
    };
  };

  const why = extract("WHY")?.body;
  const threats = extract("THREATS")?.body;
  const roles = extract("ROLES")?.body;
  const concept = extract("CONCEPT");
  const engineLine = extract("ENGINE_LINE")?.body;

  // Strip all tagged sections from body to recover the plain headline.
  let headline = body;
  ["WHY", "THREATS", "ROLES", "CONCEPT", "ENGINE_LINE"].forEach((tag) => {
    const stripRe = new RegExp(`\\[${tag}(?::[^\\]]*)?\\][\\s\\S]*?\\[/${tag}\\]`, "gi");
    headline = headline.replace(stripRe, "");
  });
  headline = headline.trim();

  return {
    moveLabel,
    moveNumber,
    color,
    playedMove,
    classification,
    evalBefore,
    evalAfter,
    bestMove,
    headline,
    why,
    threats,
    roles,
    conceptKey: concept?.attrs[0],
    conceptName: concept?.attrs[1],
    conceptBody: concept?.body,
    engineLine,
  };
}

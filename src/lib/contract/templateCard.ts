/**
 * Template fallback card — ladder step (d), the deterministic floor
 * (PR-CI-4; founder-approved 2026-08-10, plan §12 A3).
 *
 * After a confirmed error-class violation, raw prose never ships: this card
 * is rendered 100% from verified contract fields — sayables, concepts,
 * engine line, eval displays — inside the same server-authoritative
 * [INSIGHT] wrapper. It needs no LLM, so it is always available (the
 * circuit-breaker floor, plan §4) and instant (the deadline resolver, plan
 * §9 risk 7).
 *
 * TONE: two masti-register skeleton variants, chosen deterministically from
 * the insight (stable per card across retries — no Math.random, cache-safe).
 * Only the STRUCTURE is fixed; every substantive line adapts per position.
 * Copy is subject to the CI-5 Aayan voice veto (plan §12 A3/A5).
 *
 * HONEST REGISTER (plan §12 A1): when no motif is confirmed, the card says
 * plainly that the engine's preference is concrete but no named tactic was
 * verified — then teaches from the line/concept. Never bluffs a theme.
 *
 * REFEREE-SAFE BY CONSTRUCTION (unit-tested): every SAN/square comes from
 * whitelisted fields (playedSan/bestSan/PV/motif/relational), every eval
 * figure is a contract display, motif keywords appear only via
 * CONFIRMED-motif sayables, and sentinel evals render as "engine data
 * unavailable" — never "+0.00".
 */
import { formatPvAsMoveList } from "./chessFormat";
import { renderInsightHeader, INSIGHT_CLOSE_TOKEN } from "./insightGrammar";
import { runInsightChecks } from "./refereeChecks";
import type { EvalFact, InsightContract } from "./types";

function evalPhrase(f: EvalFact): string {
  if (f.sentinel || f.display === "") return "engine data unavailable";
  return f.display;
}

interface ToneSkeleton {
  /** Headline opener — non-spoiler (never names the best move). */
  headline: (i: InsightContract) => string;
  ideaLead: string;
  lineLead: string;
  closer: (i: InsightContract) => string;
}

const SKELETONS: ToneSkeleton[] = [
  {
    headline: (i) =>
      `Move ${i.moveNumber} (${i.playedSan}) is where the game tilted — a ${i.classification} worth a closer look.`,
    ideaLead: "Here's the honest picture:",
    lineLead: "The engine's preferred path:",
    closer: (i) =>
      `File this one away — the eval swing from ${evalPhrase(i.evalBefore)} to ${evalPhrase(i.evalAfter)} tells the story, and spotting this pattern earlier is exactly how you level up.`,
  },
  {
    headline: (i) =>
      `Let's slow down on move ${i.moveNumber} — ${i.playedSan} looked natural, but the engine flags it as a ${i.classification}.`,
    ideaLead: "What the verified analysis shows:",
    lineLead: "Play through the engine's line:",
    closer: (i) =>
      `The swing here was ${evalPhrase(i.evalBefore)} to ${evalPhrase(i.evalAfter)}. Positions like this reward one extra check before committing — you've got this next time.`,
  },
];

/** Deterministic tone pick — stable per insight, no RNG (cache-safe). */
function pickSkeleton(insight: InsightContract): ToneSkeleton {
  return SKELETONS[(insight.ply + insight.moveNumber) % SKELETONS.length];
}

/**
 * Render the card BODY (headline + facts; no header/close markers).
 * Exposed separately for tests; renderTemplateCard wraps it in the
 * server-authoritative header + close token.
 */
export function renderTemplateCardBody(insight: InsightContract): string {
  const s = pickSkeleton(insight);
  const lines: string[] = [];

  lines.push(s.headline(insight));
  lines.push("");
  // Founder decision 2026-08-10: fallback cards openly signal what they are —
  // a small honest confidence marker, not a disguise. (Aayan: "we want to be
  // open about the fallback cards being fallbacks.")
  lines.push(
    "_Quick honesty note: I couldn't fully verify my usual deep-dive for this move, so this card sticks to engine-checked facts only._",
  );
  lines.push("");
  lines.push(s.ideaLead);

  // Eval swing — always from contract displays (sentinel-safe).
  const dropPawns = Math.abs(insight.severityDropPawns).toFixed(1);
  lines.push(
    `- The evaluation moved from ${evalPhrase(insight.evalBefore)} to ${evalPhrase(insight.evalAfter)} after ${insight.playedSan} — about ${dropPawns} pawns of ground.`,
  );

  // Best move + engine line (whitelisted SAN only).
  const bestLine = insight.lines.find((l) => !l.isPlayedLine && l.san.length > 0) ?? insight.lines[0];
  if (insight.bestSan && insight.bestSan !== insight.playedSan) {
    lines.push(`- The engine preferred ${insight.bestSan} here.`);
  }
  if (bestLine && bestLine.san.length > 0) {
    const pv = formatPvAsMoveList(
      bestLine.san.slice(0, 8),
      insight.moveNumber,
      insight.color === "w",
    );
    lines.push(`- ${s.lineLead} ${pv}`);
  }

  // Confirmed tactical content — or the honest no-bluff register. Optional
  // lines are PRUNED through the deterministic referee before inclusion so
  // the card passes by construction (a concept definition mentioning an
  // unconfirmed motif keyword, e.g., must never re-introduce a violation).
  const safePush = (line: string) => {
    if (runInsightChecks(line, insight).length === 0) lines.push(line);
  };
  const confirmed = insight.motifs
    .map((m, k) => ({ m, k }))
    .filter(({ m }) => m.confirmed);
  if (confirmed.length > 0) {
    const say = insight.sayables.motifs[confirmed[0].k];
    if (say) safePush(`- The verified tactic: ${say.replace(/^Confirmed: /, "")}`);
  } else {
    lines.push(
      "- Straight talk: the engine's preference is concrete, but no single named tactic was verified here — the line above is the proof, so walk through it move by move.",
    );
  }

  // Concept (teach by name) when the intelligence layer supplied one.
  const concept = insight.concepts[0];
  if (concept) {
    safePush(`- The idea to take away: ${concept.name} — ${concept.definition}`);
  }

  lines.push("");
  lines.push(s.closer(insight));
  return lines.join("\n");
}

/** Full card: server-authoritative header + template body + close token. */
export function renderTemplateCard(insight: InsightContract): string {
  return `${renderInsightHeader(insight)}\n${renderTemplateCardBody(insight)}\n${INSIGHT_CLOSE_TOKEN}`;
}

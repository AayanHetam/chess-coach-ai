/**
 * Citation grammar (PR-CI-4) — [F:id] tokens: parse, resolve, coverage,
 * strip.
 *
 * The verbalizer charter requires every chess-fact sentence to end with a
 * citation token naming the contract fact it derives from. This module owns:
 *
 *  - the fact-id vocabulary (resolveFactId): which ids an InsightContract can
 *    back. Prefix families mirror the plan-§2 sketch ("[F:M3.pv0],
 *    [F:M3.rel2], [F:M3.motif0]"):
 *      <P>            the insight itself (played/best move, classification,
 *                     evalBefore/evalAfter, severity — header-adjacent facts)
 *      <P>.pv<k>      lines[k] (matches LineFact.id "M3.pv0" from builder)
 *      <P>.pv<k>.s<j> ply j of lines[k].story (what that move does — lineStory.ts)
 *      <P>.game.s<j>  ply j of the game's own continuation story (gameStory)
 *      <P>.motif<k>   motifs[k]
 *      <P>.rel<k>     flattened relational facts (captures ++ hanging ++ pins)
 *      <P>.threat<k>  threats[k]
 *      <P>.concept<k> concepts[k]
 *      <P>.delta      featureDelta
 *      <P>.branch     branchPoint / intelBranchPoint
 *      <P>.chessdb / <P>.lc0 / <P>.syzygy / <P>.maia
 *                     Degraded sources — resolvable ONLY when status==="ok"
 *                     (citing an unavailable source is a fabricated
 *                     provenance claim → citation_invalid)
 *      <P>.idea       engineIdea
 *  - citation checking (checkCitations): unresolvable tokens → findings the
 *    arming table treats as errors; coverage = cited claim-sentences /
 *    claim-sentences (isClaimSentence from refereeChecks — one grammar).
 *  - stripping: stripCitations for whole strings, CitationStripper for the
 *    streamed prefix (holds back an ambiguous "[F:..." tail across delta
 *    boundaries so a token split over two deltas never leaks to the client).
 *
 * Uncited-vocabulary policy (plan §12 Q4 v0): sentences with NO citation are
 * NOT findings here — rhetoric is cite-exempt. Uncited HARD claims are
 * caught by the deterministic checks 2-5 (they validate content, not
 * citation presence); coverage is the telemetry that watches the trend.
 */
import type { ServingFinding } from "./armingConfig";
import type { ContractCitationGranularity } from "@/env";
import { isClaimSentence, isDefinitionalSentence } from "./refereeChecks";
import { splitProseSentences } from "./sentences";
import type { InsightContract } from "./types";

/** [F:id] token — id charset covers "M3.pv0"-style dotted ids. */
const CITATION_TOKEN_RE = /\[F:([A-Za-z0-9_.-]{1,40})\]/g;
/** Streaming-safe: longest suffix that might be the start of a token. */
const CITATION_OPEN = "[F:";

function clone(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags);
}

// ── Fact-id resolution ──────────────────────────────────────────────────────
function relationalCount(insight: InsightContract): number {
  const r = insight.relational;
  if (!r) return 0;
  return r.captures.length + r.hanging.length + r.pins.length;
}

/** True iff `id` resolves to a populated fact on THIS insight. */
export function resolveFactId(id: string, insight: InsightContract): boolean {
  const p = insight.factIdPrefix;
  if (id === p) return true;
  if (!id.startsWith(`${p}.`)) return false;
  const suffix = id.slice(p.length + 1);

  const indexed = (name: string): number | null => {
    if (!suffix.startsWith(name)) return null;
    const rest = suffix.slice(name.length);
    if (!/^\d{1,2}$/.test(rest)) return null;
    return Number.parseInt(rest, 10);
  };

  // <P>.pv<k>.s<j> — ply j of line k's story (lineStory.ts).
  const storyRef = /^pv(\d{1,2})\.s(\d{1,2})$/.exec(suffix);
  if (storyRef) {
    const line = insight.lines[Number.parseInt(storyRef[1], 10)];
    return !!line?.story && Number.parseInt(storyRef[2], 10) < line.story.plies.length;
  }
  const gameRef = /^game\.s(\d{1,2})$/.exec(suffix);
  if (gameRef) return !!insight.gameStory && Number.parseInt(gameRef[1], 10) < insight.gameStory.plies.length;
  const pv = indexed("pv");
  if (pv !== null) return pv < insight.lines.length;
  const motif = indexed("motif");
  if (motif !== null) return motif < insight.motifs.length;
  const rel = indexed("rel");
  if (rel !== null) return rel < relationalCount(insight);
  const threat = indexed("threat");
  if (threat !== null) return threat < (insight.threats?.length ?? 0);
  const concept = indexed("concept");
  if (concept !== null) return concept < insight.concepts.length;

  switch (suffix) {
    case "game":
      return !!insight.gameStory && insight.gameStory.plies.length > 0;
    case "delta":
      return insight.featureDelta !== null;
    case "branch":
      return insight.branchPoint !== null || insight.intelBranchPoint !== null;
    case "idea":
      return insight.engineIdea !== null;
    case "chessdb":
      return insight.chessdb.status === "ok";
    case "lc0":
      return insight.lc0.status === "ok";
    case "syzygy":
      return insight.syzygy.status === "ok";
    case "maia":
      return insight.visibility.status === "ok";
    default:
      return false;
  }
}

// ── Citation check + coverage ───────────────────────────────────────────────
export interface CitationReport {
  /** All tokens found (raw ids). */
  tokens: string[];
  /** Tokens that resolve to a contract fact. */
  validTokens: string[];
  findings: ServingFinding[];
  /** Sentences carrying a chess claim (refereeChecks.isClaimSentence). */
  claimSentences: number;
  /** Claim sentences counted as cited under the active granularity. */
  citedClaimSentences: number;
  /** citedClaimSentences / claimSentences (1 when no claim sentences). */
  coverage: number;
}

/**
 * Sentence split for the coverage denominator. Chess-aware (see
 * ./sentences.ts): "8. e5" / "31... h5" / "9. Bd2 Bb4" are ONE sentence, not
 * three — the naive split inflated the denominator with uncitable fragments
 * and cost ~6pp of measured coverage on the CI-4 verification run.
 */
function splitSentences(text: string): string[] {
  return splitProseSentences(text);
}

/**
 * Structural grammar tokens the CLIENT renders as widgets — [CONCEPT:...],
 * [CONTINUATION:...], [WHY], [/THREATS], header echoes, etc. They carry SAN/
 * square/keyword text but are NOT prose claims (the widgets render
 * server-verified data), so they are excluded from the citation-coverage
 * denominator — counting markup as "uncited claim sentences" was a pure
 * measurement artifact.
 */
const GRAMMAR_TOKEN_LINE_RE = /^\s*(?:\[\/?[A-Z_]+(?::[^\]]*)?\]\s*)+$/;

/** Exported for the ladder: blank out structural widget lines so the
 * deterministic referee sees only prose (a [CONCEPT:fork:...] practice-
 * button tag on a card without a confirmed fork is widget labeling, not a
 * tactical claim — refereeing markup was a measured false-fire class). */
export function stripGrammarTokenLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !GRAMMAR_TOKEN_LINE_RE.test(line))
    .join("\n");
}

/** Any eval / mate figure — the one claim family isDefinitionalSentence
 * does not look for. */
const FIGURE_RE = /[+-]\s?\d+\.\d+|\bM[+-]?\d+\b|\bmate in \d+\b/i;

/**
 * The [CONCEPT:id:Title] widget body is GENERIC PATTERN PEDAGOGY, not a claim
 * about this game ("Knight forks punish pieces standing two squares apart —
 * one hop, two targets."). The charter tells the model those widget bodies
 * carry no citation, and all three founder-approved gold examples show them
 * uncited — so counting them in the coverage denominator measured the model
 * following instructions as a citation miss. It was ~8% of the whole
 * denominator (0/20 cited on the 2026-08-10 run) and is the single largest
 * block of "uncited claims" there.
 *
 * The exemption is deliberately narrow: only concept-body lines that name NO
 * square, NO SAN, and NO eval/mate figure are exempt. A concept body that
 * reaches back into the position ("here Ba5+ is that move") still counts and
 * still must be cited — and the referee still sees the whole body for
 * fabrication either way, so this changes measurement, never enforcement.
 */
export function stripGenericConceptPedagogy(
  text: string,
  isDefinitional: (s: string) => boolean,
): string {
  const out: string[] = [];
  let inConcept = false;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^\[CONCEPT:/.test(t)) {
      inConcept = true;
      out.push(line);
      continue;
    }
    if (/^\[\/CONCEPT\]/.test(t)) {
      inConcept = false;
      out.push(line);
      continue;
    }
    if (inConcept && t && isDefinitional(t) && !FIGURE_RE.test(t)) continue;
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Check every [F:id] token in `prose` against the insight's fact space and
 * compute citation coverage. `granularity` "paragraph" (the pre-built
 * persona fallback, dark by default) counts a claim sentence as cited when
 * its paragraph carries at least one valid token.
 */
export function checkCitations(
  prose: string,
  insight: InsightContract,
  granularity: ContractCitationGranularity = "sentence",
): CitationReport {
  const tokens: string[] = [];
  const validTokens: string[] = [];
  const findings: ServingFinding[] = [];

  for (const m of Array.from(prose.matchAll(clone(CITATION_TOKEN_RE)))) {
    const id = m[1];
    tokens.push(id);
    if (resolveFactId(id, insight)) {
      validTokens.push(id);
    } else {
      findings.push({
        check: "citation_invalid",
        severity: "error",
        category: "citation_unresolvable",
        span: m[0],
        detail: `citation ${m[0]} resolves to no fact on insight ${insight.factIdPrefix}`,
      });
    }
  }

  let claimSentences = 0;
  let citedClaimSentences = 0;
  // Coverage is measured over the CITE-REQUIRED text: generic concept-widget
  // pedagogy is excluded (see stripGenericConceptPedagogy). Token validity
  // above still ran over the full prose.
  const paragraphs = stripGenericConceptPedagogy(prose, isDefinitionalSentence).split(/\n{2,}/);
  for (const para of paragraphs) {
    const paraCited = clone(CITATION_TOKEN_RE).test(para);
    for (const sentence of splitSentences(para)) {
      // Structural widget markup is not a prose claim (see
      // GRAMMAR_TOKEN_LINE_RE) — excluded from the coverage denominator.
      if (GRAMMAR_TOKEN_LINE_RE.test(sentence)) continue;
      // Strip tokens before claim detection so a citation never makes a
      // rhetoric sentence count as a claim.
      const bare = stripCitations(sentence);
      if (!isClaimSentence(bare)) continue;
      claimSentences += 1;
      const cited =
        granularity === "paragraph" ? paraCited : clone(CITATION_TOKEN_RE).test(sentence);
      if (cited) citedClaimSentences += 1;
    }
  }

  return {
    tokens,
    validTokens,
    findings,
    claimSentences,
    citedClaimSentences,
    coverage: claimSentences > 0 ? citedClaimSentences / claimSentences : 1,
  };
}

// ── Stripping ───────────────────────────────────────────────────────────────
/** Remove every [F:id] token plus one adjacent space — leading space when
 * present ("wins a piece [F:M1.motif0]." → "wins a piece."), else one
 * trailing space ("[F:M1.motif0] material" → "material", the delta-boundary
 * case where the leading space was already forwarded). */
export function stripCitations(text: string): string {
  return text
    .replace(/ \[F:[A-Za-z0-9_.-]{1,40}\]/g, "")
    .replace(/\[F:[A-Za-z0-9_.-]{1,40}\] ?/g, "");
}

/**
 * Streaming-safe citation stripper for the enforce path's PREFIX text (the
 * greeting streams token-by-token; a [F: token could split across deltas).
 * push() returns the bytes safe to forward now; flush() returns the held
 * tail at stream end (an unterminated "[F:..." is forwarded raw — content is
 * never swallowed, plan risk #5 posture).
 */
export class CitationStripper {
  private tail = "";

  push(delta: string): string {
    const text = this.tail + delta;
    const stripped = stripCitations(text);
    // Hold back the longest suffix that could still become a citation token:
    // either a partial "[F:" opener or an unclosed "[F:id..." body.
    const held = ambiguousCitationTail(stripped);
    this.tail = held;
    return stripped.slice(0, stripped.length - held.length);
  }

  flush(): string {
    const out = this.tail;
    this.tail = "";
    return out;
  }
}

function ambiguousCitationTail(text: string): string {
  // Unclosed token body: "...[F:M3.pv" (no "]" yet, still short enough).
  const openIdx = text.lastIndexOf(CITATION_OPEN);
  if (openIdx !== -1) {
    const after = text.slice(openIdx);
    if (!after.includes("]") && after.length <= CITATION_OPEN.length + 40) {
      // Include a preceding space so the strip-with-space form still applies
      // once the token completes.
      const start = openIdx > 0 && text[openIdx - 1] === " " ? openIdx - 1 : openIdx;
      return text.slice(start);
    }
  }
  // Partial opener at the very end: "[", "[F".
  for (let len = CITATION_OPEN.length - 1; len > 0; len--) {
    if (text.endsWith(CITATION_OPEN.slice(0, len))) {
      const start = text.length - len;
      const withSpace = start > 0 && text[start - 1] === " " ? start - 1 : start;
      return text.slice(withSpace);
    }
  }
  return "";
}

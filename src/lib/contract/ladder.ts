/**
 * Failure ladder (PR-CI-4) — per-insight enforcement, plan §4:
 *
 *   referee pass → forward
 *   violation    → (a) deterministic sentence-drop
 *                → (b) Haiku surgical edit          (≤2/review)
 *                → (c) per-insight Sonnet regen     (≤1/insight, ≤3/review)
 *                → (d) deterministic template card  (the floor — always)
 *
 * Every stage re-validates through the SAME referee before shipping; a card
 * is never silently dropped and unverified prose never ships past a
 * confirmed violation. Referee-INFRASTRUCTURE failure (the referee itself
 * throwing — not a violation) fails visible as footnoted raw (plan §4
 * circuit breaker), never blank, never a 500.
 *
 * DEADLINE (tech-lead decision #4): the caller computes a hard wall-clock
 * deadline (route budget − 5s margin, inside maxDuration 60s). LLM stages
 * (edit/regen, and the Haiku relational parse) are skipped once the deadline
 * cannot fit them; the deterministic stages (referee, sentence-drop,
 * template) always run — on breach a violating card resolves to the
 * template card instantly (plan §9 risks 7/8).
 */
import { correctStreamedAnalysis } from "@/lib/mastermind/validators/streamCorrection";
import type { StreamCorrectionOpts, StreamCorrectionResult } from "@/lib/mastermind/validators/streamCorrection";
import type { ValidatorIssue } from "@/lib/mastermind/validators/types";
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import { callLLM as defaultCallLLM } from "@/lib/llmProvider";
import type { ContractCitationGranularity, ContractRefereeMode } from "@/env";
import { armFindings } from "./armingConfig";
import type { ArmingTable, ServingFinding } from "./armingConfig";
import { checkCitations, stripCitations, stripGrammarTokenLines } from "./citations";
import { INSIGHT_CLOSE_TOKEN, renderInsightHeader } from "./insightGrammar";
import { refereeInsight, refereeInsightRelational } from "./referee";
import type { RefereeInsightOpts, RefereeRelationalOpts } from "./referee";
import { renderTemplateCardBody } from "./templateCard";
import type { CoachContract, InsightContract } from "./types";

// ── Budgets (per review, shared across cards — plan §4 hard caps) ───────────
export interface LadderBudgets {
  /** Haiku surgical edits remaining (starts at 2). */
  editsRemaining: number;
  /** Sonnet per-insight regens remaining (starts at 3; also ≤1 per insight). */
  regensRemaining: number;
  /** Haiku relational parses remaining (starts at MAX_RELATIONAL_PARSES_PER_REVIEW). */
  relationalRemaining: number;
}

export const DEFAULT_LADDER_BUDGETS = (): LadderBudgets => ({
  editsRemaining: 2,
  regensRemaining: 3,
  relationalRemaining: 8,
});

/** Conservative wall-clock cost estimates for "does this stage still fit". */
const EDIT_ESTIMATE_MS = 10_000; // streamCorrection's own timeout
const REGEN_ESTIMATE_MS = 15_000;
const RELATIONAL_ESTIMATE_MS = 4_000;

export type LadderStage =
  | "pass"
  | "sentence_drop"
  | "edited"
  | "regenerated"
  | "templated"
  | "passthrough_footnoted";

export interface LadderCardResult {
  factIdPrefix: string;
  stage: LadderStage;
  /** Full client-bound block: authoritative header + body + close token,
   * [F:] tokens STRIPPED. */
  finalText: string;
  /** Citation coverage of the model's ORIGINAL body (pre-ladder). */
  citationCoverage: number;
  /** Valid cited fact ids from the SHIPPED body (CMIP payload fuel). */
  citedFactIds: string[];
  errorsInitial: number;
  warnsInitial: number;
  /** Sample of the initial armed-error findings (telemetry). */
  findings: Array<{ check: string; category: string; span: string }>;
  editsUsed: number;
  regensUsed: number;
  relationalParsesUsed: number;
  costUsd: number;
  elapsedMs: number;
  deadlineBreached: boolean;
}

export interface LadderDeps {
  /** Test seams — default to the shipping implementations. */
  correctImpl?: (opts: StreamCorrectionOpts) => Promise<StreamCorrectionResult>;
  callLLMImpl?: (opts: CallLLMOptions) => Promise<LLMResult>;
  relationalParseCall?: RefereeRelationalOpts["parseCall"];
  now?: () => number;
}

export interface LadderCardOpts {
  insight: InsightContract;
  contract: CoachContract;
  refereeOpts: RefereeInsightOpts;
  refereeMode: ContractRefereeMode;
  citationGranularity: ContractCitationGranularity;
  /** Hard wall-clock deadline (epoch ms). */
  deadlineAtMs: number;
  /** Shared per-review budgets — MUTATED as stages consume them. */
  budgets: LadderBudgets;
  /** Verbalizer system parts for the regen call (persona + charter). */
  regenSystem: { stable: string; perUser: string };
  deps?: LadderDeps;
}

// ── Internal: evaluate one candidate body against the full serving referee ──
interface BodyEvaluation {
  errors: ServingFinding[];
  warns: ServingFinding[];
  coverage: number;
  citedFactIds: string[];
  relationalParsesUsed: number;
  costUsd: number;
}

async function evaluateBody(
  body: string,
  opts: LadderCardOpts,
  armingTable: ArmingTable | undefined,
  now: () => number,
  /**
   * "live"    — first evaluation: in full referee mode, run the bounded
   *             synchronous Haiku relational parse (plan §4 check 6).
   * "recheck" — post-stage re-validation: deterministic checks re-run in
   *             full, but instead of paying another Haiku parse (latency +
   *             cost per ladder stage), the PRIOR relational error findings
   *             are re-asserted against the candidate text — a finding whose
   *             span survived still fails; excised/edited-away spans clear.
   */
  relationalMode: "live" | "recheck",
  priorRelationalErrors: ServingFinding[] = [],
): Promise<BodyEvaluation> {
  // The referee sees PROSE only: structural widget lines ([CONCEPT:...],
  // [CONTINUATION:...], section markers) are client-rendered markup, not
  // claims — refereeing them was a measured false-fire class.
  const prose = stripGrammarTokenLines(body);
  const citation = checkCitations(body, opts.insight, opts.citationGranularity);
  // Deterministic checks 2-5 run on the prose; the header is server-rendered
  // from the contract and passes by construction.
  const det = refereeInsight(prose, opts.insight, opts.refereeOpts);
  const findings: ServingFinding[] = [...citation.findings, ...det.findings];

  let relationalParsesUsed = 0;
  let costUsd = 0;
  if (relationalMode === "live") {
    if (
      opts.refereeMode === "full" &&
      opts.budgets.relationalRemaining > 0 &&
      now() + RELATIONAL_ESTIMATE_MS < opts.deadlineAtMs
    ) {
      opts.budgets.relationalRemaining -= 1;
      relationalParsesUsed = 1;
      try {
        const rel = await refereeInsightRelational(prose, opts.insight, {
          correlationId: opts.refereeOpts.correlationId,
          parseCall: opts.deps?.relationalParseCall,
        });
        findings.push(...rel.findings);
        costUsd += rel.costUsd;
      } catch {
        // Referee-infra failure on the optional Haiku check: fail OPEN here
        // (the deterministic floor already ran); never block the card on it.
      }
    }
  } else {
    for (const f of priorRelationalErrors) {
      if (f.span && prose.includes(f.span)) findings.push(f);
    }
  }

  const armed = armFindings(findings, armingTable);
  return {
    errors: armed.errors,
    warns: armed.warns,
    coverage: citation.coverage,
    citedFactIds: citation.validTokens,
    relationalParsesUsed,
    costUsd,
  };
}

// ── Internal: sentence-drop (stage a — deterministic span excision) ─────────
const GRAMMAR_LINE_RE = /^\s*\[\/?[A-Z_]+(?::[^\]]*)?\]\s*$/;

/** Drop every sentence containing an error span. Returns null when the drop
 * would leave no substantive prose (the whole body was the violation). */
export function dropViolatingSentences(body: string, spans: string[]): string | null {
  if (spans.length === 0) return body;
  const lines = body.split("\n");
  const kept: string[] = [];
  let droppedAny = false;
  for (const line of lines) {
    if (GRAMMAR_LINE_RE.test(line) || !spans.some((s) => s && line.includes(s))) {
      kept.push(line);
      continue;
    }
    // Split the line into sentences; drop only the offending ones.
    const sentences = line.split(/(?<=[.!?])\s+/);
    const keptSentences = sentences.filter((sen) => !spans.some((s) => s && sen.includes(s)));
    droppedAny = true;
    if (keptSentences.length > 0) kept.push(keptSentences.join(" "));
  }
  if (!droppedAny) return null; // spans not locatable line-wise — can't excise
  const result = kept.join("\n");
  const substantive = result.replace(/\[[^\]]*\]/g, "").trim();
  return substantive.length >= 40 ? result : null;
}

function findingsToIssues(findings: ServingFinding[]): ValidatorIssue[] {
  return findings.map((f) => ({
    check_name: f.check as unknown as ValidatorIssue["check_name"],
    severity: "error" as const,
    llm_span: f.span,
    expected: null,
    actual: null,
    detail: f.detail,
  }));
}

function buildRegenRequest(
  opts: LadderCardOpts,
  previousBody: string,
  errors: ServingFinding[],
): CallLLMOptions {
  const { insight } = opts;
  const failedList = errors
    .slice(0, 8)
    .map((f, i) => `${i + 1}. [${f.check}] "${f.span.slice(0, 120)}" — ${f.detail.slice(0, 200)}`)
    .join("\n");
  const slice = JSON.stringify({
    factIdPrefix: insight.factIdPrefix,
    moveNumber: insight.moveNumber,
    color: insight.color,
    playedSan: insight.playedSan,
    bestSan: insight.bestSan,
    classification: insight.classification,
    severityDropPawns: insight.severityDropPawns,
    evalBefore: insight.evalBefore,
    evalAfter: insight.evalAfter,
    lines: insight.lines,
    branchPoint: insight.branchPoint,
    motifs: insight.motifs,
    sayables: insight.sayables,
    allowedTacticalKeywords: insight.allowedTacticalKeywords,
    relational: insight.relational,
    threats: insight.threats,
    concepts: insight.concepts,
    engineIdea: insight.engineIdea,
    chessdb: insight.chessdb,
    lc0: insight.lc0,
    syzygy: insight.syzygy,
    visibility: insight.visibility,
  });
  const user = [
    `Regenerate the BODY of one insight card. The header line is fixed by the server: ${renderInsightHeader(insight)}`,
    "",
    "VERIFIED FACT CONTRACT for this insight (the complete set of assertable facts):",
    slice,
    "",
    "Your previous body failed these referee checks:",
    failedList,
    "",
    "Rules: follow the VERBALIZER CHARTER (citations on every fact sentence, displays verbatim, no facts beyond the contract, honest register when no motif is confirmed). Output ONLY the body text — no [INSIGHT] header, no [/INSIGHT] close token.",
  ].join("\n");
  return {
    tier: "flagship",
    system: opts.regenSystem.stable,
    systemSuffix: opts.regenSystem.perUser,
    cacheSystem: true,
    messages: [
      { role: "assistant", content: previousBody },
      { role: "user", content: user },
    ],
    temperature: 0.7,
    maxTokens: 1200,
  };
}

const SONNET_IN = 3 / 1_000_000;
const SONNET_OUT = 15 / 1_000_000;

function wrapBlock(insight: InsightContract, body: string): string {
  return `${renderInsightHeader(insight)}\n${stripCitations(body).trim()}\n${INSIGHT_CLOSE_TOKEN}`;
}

/**
 * Run the full ladder for one card. `modelBody` is the model's body text
 * (between the header "]" and "[/INSIGHT]"), citations intact.
 */
export async function runInsightLadder(
  modelBody: string,
  opts: LadderCardOpts,
  armingTable?: ArmingTable,
): Promise<LadderCardResult> {
  const now = opts.deps?.now ?? Date.now;
  const t0 = now();
  const correct = opts.deps?.correctImpl ?? correctStreamedAnalysis;
  const callLLM = opts.deps?.callLLMImpl ?? defaultCallLLM;
  const { insight } = opts;

  let costUsd = 0;
  let editsUsed = 0;
  let regensUsed = 0;
  let relationalParsesUsed = 0;
  let deadlineBreached = false;

  const finish = (
    stage: LadderStage,
    finalText: string,
    initial: BodyEvaluation | null,
  ): LadderCardResult => ({
    factIdPrefix: insight.factIdPrefix,
    stage,
    finalText,
    citationCoverage: initial?.coverage ?? 0,
    citedFactIds: initial?.citedFactIds ?? [],
    errorsInitial: initial?.errors.length ?? 0,
    warnsInitial: initial?.warns.length ?? 0,
    findings: (initial?.errors ?? [])
      .slice(0, 8)
      .map((f) => ({ check: f.check, category: f.category, span: f.span.slice(0, 60) })),
    editsUsed,
    regensUsed,
    relationalParsesUsed,
    costUsd,
    elapsedMs: now() - t0,
    deadlineBreached,
  });

  let initial: BodyEvaluation;
  try {
    initial = await evaluateBody(modelBody.trim(), opts, armingTable, now, "live");
    relationalParsesUsed += initial.relationalParsesUsed;
    costUsd += initial.costUsd;
  } catch (err) {
    // Referee-INFRASTRUCTURE failure: fail visible — raw body + footnote
    // (plan §4 circuit breaker; reserved for infra, not violations).
    const note = `\n\n*Engine check unavailable for this card (${err instanceof Error ? err.message.slice(0, 80) : "internal error"}) — the analysis above was served unverified.*`;
    return finish("passthrough_footnoted", wrapBlock(insight, modelBody.trim() + note), null);
  }

  if (initial.errors.length === 0) {
    return finish("pass", wrapBlock(insight, modelBody.trim()), initial);
  }
  // Relational error findings re-asserted (span presence) on recheck passes
  // instead of paying a fresh Haiku parse per ladder stage.
  const priorRelational = initial.errors.filter((f) => f.check === "relational_claim");

  // ── (a) deterministic sentence-drop ───────────────────────────────────────
  const dropped = dropViolatingSentences(
    modelBody.trim(),
    initial.errors.map((f) => f.span),
  );
  if (dropped !== null) {
    try {
      const check = await evaluateBody(dropped, opts, armingTable, now, "recheck", priorRelational);
      relationalParsesUsed += check.relationalParsesUsed;
      costUsd += check.costUsd;
      if (check.errors.length === 0) {
        return finish("sentence_drop", wrapBlock(insight, dropped), initial);
      }
    } catch {
      /* fall through the ladder */
    }
  }

  // ── (b) Haiku surgical edit (≤2/review) ───────────────────────────────────
  if (opts.budgets.editsRemaining > 0 && now() + EDIT_ESTIMATE_MS < opts.deadlineAtMs) {
    opts.budgets.editsRemaining -= 1;
    editsUsed += 1;
    try {
      const correction = await correct({
        rawText: modelBody.trim(),
        issues: findingsToIssues(initial.errors),
        correlationId: opts.refereeOpts.correlationId,
        maxTokens: 2000,
      });
      costUsd += correction.costUsd;
      // "footnoted" means the edit itself failed — a confirmed violation
      // stands, so the footnoted raw must NOT ship (that path is reserved
      // for referee-infra failure). Only re-check genuine edits.
      if (correction.mode === "edited") {
        const check = await evaluateBody(correction.correctedText, opts, armingTable, now, "recheck", priorRelational);
        relationalParsesUsed += check.relationalParsesUsed;
        costUsd += check.costUsd;
        if (check.errors.length === 0) {
          return finish("edited", wrapBlock(insight, correction.correctedText), initial);
        }
      }
    } catch {
      /* fall through the ladder */
    }
  } else if (now() + EDIT_ESTIMATE_MS >= opts.deadlineAtMs) {
    deadlineBreached = true;
  }

  // ── (c) ONE per-insight Sonnet regen (≤3/review) ─────────────────────────
  if (opts.budgets.regensRemaining > 0 && now() + REGEN_ESTIMATE_MS < opts.deadlineAtMs) {
    opts.budgets.regensRemaining -= 1;
    regensUsed += 1;
    try {
      const result = await callLLM(buildRegenRequest(opts, modelBody.trim(), initial.errors));
      costUsd += result.inputTokens * SONNET_IN + result.outputTokens * SONNET_OUT;
      const regenBody = result.content.trim();
      if (regenBody.length > 0) {
        const check = await evaluateBody(regenBody, opts, armingTable, now, "recheck", priorRelational);
        relationalParsesUsed += check.relationalParsesUsed;
        costUsd += check.costUsd;
        if (check.errors.length === 0) {
          return finish("regenerated", wrapBlock(insight, regenBody), initial);
        }
      }
    } catch {
      /* fall through to the template floor */
    }
  } else if (now() + REGEN_ESTIMATE_MS >= opts.deadlineAtMs) {
    deadlineBreached = true;
  }

  // ── (d) template card — the deterministic floor, always available ────────
  return finish("templated", wrapBlock(insight, renderTemplateCardBody(insight)), initial);
}

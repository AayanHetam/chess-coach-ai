/**
 * One fielded follow-up turn (pathway 3.1, `COACH_FOLLOWUP_PROMPT=fielded`):
 * the model fills the moment envelope (moment.ts) on the existing
 * non-streaming call, the app checks the fields (momentChecks.ts) and runs
 * the unchanged follow-up referee over their projection as a pre-pass, at
 * most one regeneration carries the computed result for the fields that
 * failed, a field that fails twice is omitted with the app's one-clause
 * unknown (idea, happens and the proof; a lesson or a question simply goes),
 * and the result is projected to today's grammar, which the route hands to
 * the same referee again as a second net.
 *
 * Which checks act and which only count is the arming table below: only
 * deterministic checks, and the referee's verdicts the referee already acts
 * on in production, act. The rest are counted for the keyed run, which is
 * what may arm them later.
 *
 * Pure except for the injected `callLLM`. Never logs: the route logs the
 * content-free counter.
 */
import type { CallLLMOptions, LLMResult } from "@/lib/llmProvider";
import type { FollowUpRefereeResult } from "@/lib/contract/followUpReferee";
import type { RegenerateResult } from "@/lib/mastermind/validators/regenerate";
import type {
  TelemetryEvent,
  ValidatorIssue,
  ValidatorResult,
} from "@/lib/mastermind/validators/types";
import { createTelemetryEvent } from "@/lib/mastermind/validators/telemetry";
import { estimateCostUSD } from "@/lib/llmPricing";
import {
  LINE_TOKEN_INLINE_RE,
  countProseWords,
  momentFromFollowUpText,
  momentToText,
  parseMomentEnvelope,
  parseProofToken,
  proseFromEnvelope,
  type MomentEnvelope,
  type MomentProse,
  type MomentProseField,
} from "./moment";
import {
  checkMoment,
  describeSquare,
  resolveProof,
  type MomentCheckFailure,
  type MomentCheckName,
} from "./momentChecks";
import type { FieldedMomentFacts } from "./fieldedFacts";

/** How long the regeneration may take before call 1's checked fields are served. */
export const FIELDED_REGEN_BUDGET_MS = 4000;

/** Which checks act on a field and which are only counted. */
export const MOMENT_CHECK_ARMING = {
  empty: "act",
  proof_unresolved: "act",
  proof_illegal: "act",
  lesson_not_teaching: "act",
  budget: "count",
  san_in_prose: "count",
  eval_in_prose: "count",
  tactical_keyword: "count",
  piece_on_square: "count",
} as const satisfies Record<MomentCheckName, "act" | "count">;

const FIELDS: readonly MomentProseField[] = [
  "idea",
  "happens",
  "proof",
  "lesson",
  "question",
];

/** The regeneration's units: the opening line is one, each other field its own. */
const UNITS: readonly (readonly MomentProseField[])[] = [
  ["idea", "happens"],
  ["proof"],
  ["lesson"],
  ["question"],
];

export type FieldedParse = "clean" | "repaired" | "prose" | "failed";

/** Content-free: counts, codes and names, never a move, a board or prose. */
export interface FieldedCounter {
  served: "fielded" | "v1_fallback";
  parse: FieldedParse;
  repairs: string[];
  calls: number;
  providers: string[];
  llmMs: number[];
  retryCount: 0 | 1;
  regenerated: MomentProseField[];
  regenAborted: boolean;
  first: Record<string, number>;
  second: Record<string, number>;
  firstReferee: Record<string, number>;
  secondReferee: Record<string, number>;
  omitted: MomentProseField[];
  clauses: number;
  proofKind: "engine" | "played" | null;
  openingWords: number;
  lessonWords: number;
  proseValidator: "absent" | "ran" | "failed";
  proseIssues: number;
}

export interface FieldedTurnResult {
  served: "fielded" | "v1_fallback";
  text: string;
  prose: MomentProse | null;
  calls: LLMResult[];
  retryCount: 0 | 1;
  /** Spans the prose validator contradicted: the referee drops their sentences. */
  flaggedSpans?: string[];
  proseIssues: ValidatorIssue[];
  proseTelemetry: TelemetryEvent[];
  proseCostUsd: number;
  /** Call 1's envelope, normalized; null on the v1 fallback. */
  envelope1: MomentEnvelope | null;
  counter: FieldedCounter;
}

// ── Normalizing a reply ─────────────────────────────────────────────────────

const LABEL_RE =
  /^\s*(?:\*\*)?(?:lesson|your turn|idea|happens|what happens|question)(?:\*\*)?\s*:\s*/i;

/**
 * Labels the model was told not to write, a token inside a prose field
 * (lifted into the proof when it has none), and line breaks, out of every
 * string; each repair named.
 */
export function normalizeEnvelope(e: MomentEnvelope): {
  envelope: MomentEnvelope;
  repairs: string[];
} {
  const repairs = new Set<string>();
  let proof = e.proof;
  const clean = (s: string, lift: boolean): string => {
    let t = s;
    if (LABEL_RE.test(t)) {
      t = t.replace(LABEL_RE, "");
      repairs.add("label_stripped");
    }
    const tokens = Array.from(t.matchAll(LINE_TOKEN_INLINE_RE));
    if (tokens.length > 0) {
      if (lift && !proof) {
        const ref = parseProofToken(tokens[0][0]);
        if (ref) {
          proof = ref;
          repairs.add("token_lifted");
        }
      }
      t = t.replace(LINE_TOKEN_INLINE_RE, " ");
      repairs.add("token_stripped");
    }
    if (/\r?\n/.test(t)) {
      t = t.replace(/\s*\r?\n\s*/g, " ");
      repairs.add("newline_collapsed");
    }
    return t.replace(/[ \t]{2,}/g, " ").trim();
  };
  const idea = clean(e.idea, true);
  const happens = clean(e.happens, true);
  const question = e.question === null ? null : clean(e.question, true);
  const lesson = e.lesson
    ? {
        pattern: clean(e.lesson.pattern, false),
        check: clean(e.lesson.check, false),
      }
    : null;
  return {
    envelope: { idea, happens, proof, lesson, question },
    repairs: Array.from(repairs),
  };
}

// ── Judging an envelope ─────────────────────────────────────────────────────

interface FieldDrop {
  fields: MomentProseField[];
  sentence: string;
  reason: string;
}

interface Judgement {
  failures: MomentCheckFailure[];
  drops: FieldDrop[];
  failed: Set<MomentProseField>;
}

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** A field on its own, as the projection writes it ("Lesson: ...", the token). */
function renderField(env: MomentEnvelope, field: MomentProseField): string {
  const only: MomentProse = {
    idea: null,
    happens: null,
    proof: null,
    lesson: null,
    question: null,
    more: null,
    omitted: [],
  };
  if (field === "idea") only.idea = env.idea;
  else if (field === "happens") only.happens = env.happens;
  else if (field === "proof") only.proof = env.proof;
  else if (field === "lesson") only.lesson = env.lesson;
  else only.question = env.question;
  return momentToText(only);
}

function judge(
  env: MomentEnvelope,
  fx: FieldedMomentFacts,
  referee: (text: string) => FollowUpRefereeResult
): Judgement {
  const failures = checkMoment(env, fx.facts);
  const failed = new Set<MomentProseField>();
  for (const f of failures)
    if (MOMENT_CHECK_ARMING[f.check] === "act") failed.add(f.field);
  let dropped: { sentence: string; reason: string }[] = [];
  try {
    dropped = referee(momentToText(proseFromEnvelope(env))).dropped;
  } catch {
    dropped = [];
  }
  const rendered = FIELDS.map((f) => [f, squash(renderField(env, f))] as const);
  const drops: FieldDrop[] = dropped.map((d) => {
    const s = squash(d.sentence);
    const fields = rendered
      .filter(([, text]) => s.length > 0 && text.includes(s))
      .map(([f]) => f);
    // Only the opening line can straddle two fields.
    const owners: MomentProseField[] =
      fields.length > 0 ? fields : ["idea", "happens"];
    for (const f of owners) failed.add(f);
    return { fields: owners, sentence: d.sentence, reason: d.reason };
  });
  return { failures, drops, failed };
}

// ── The regeneration turn ───────────────────────────────────────────────────

const colourName = (c: "w" | "b") => (c === "w" ? "White" : "Black");

function list(xs: readonly string[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
}

function failureDetail(f: MomentCheckFailure): string {
  if (f.check === "proof_unresolved") {
    const available = Array.isArray(f.computed.available)
      ? (f.computed.available as string[])
      : [];
    const refs = available.map((a) => {
      const [kind, n, color] = a.split(":");
      return JSON.stringify({ kind, moveNumber: Number(n), color });
    });
    const kind = f.computed.kind === "played" ? "game" : "engine";
    const color = f.computed.color === "b" ? "b" : "w";
    return `there is no ${kind} line for move ${f.computed.moveNumber} (${colourName(color)}); use ${refs.length > 0 ? `${refs.join(" or ")} or null` : "null"}`;
  }
  if (f.check === "proof_illegal") return "that line does not replay; use null";
  return f.detail;
}

function dropDetail(
  d: FieldDrop,
  fx: FieldedMomentFacts,
  counted: readonly MomentCheckFailure[]
): string {
  const [kind, ...rest] = d.reason.split(":");
  const what = rest.join(":");
  if (kind === "san") return `${what} is not a move the facts give here`;
  if (kind === "eval") return "write no number; the board shows the evaluation";
  if (kind === "tactical") {
    const also = counted.find(
      (f) => f.check === "tactical_keyword" && d.fields.includes(f.field)
    );
    return `nothing in the facts for this move confirms a ${what}; say what it does in plain words${also ? ` (${also.detail})` : ""}`;
  }
  if (kind === "piece") {
    const sq = /[a-h][1-8]/.exec(what)?.[0];
    return sq
      ? `"${what}" does not stand there: ${sq} is ${describeSquare(fx.fenBefore, sq)} before ${fx.label} and ${describeSquare(fx.fenAfter, sq)} after it`
      : `"${what}" does not stand there`;
  }
  return "the app could not check this; leave it out";
}

/** The user turn for the regeneration: the fields to redo and what is true instead. */
export function buildFieldRetryTurn(
  targets: readonly MomentProseField[],
  j: Judgement,
  fx: FieldedMomentFacts
): string {
  const counted = j.failures.filter(
    (f) => MOMENT_CHECK_ARMING[f.check] === "count"
  );
  const lines: string[] = [];
  for (const field of targets) {
    const items: string[] = [];
    for (const f of j.failures)
      if (f.field === field && MOMENT_CHECK_ARMING[f.check] === "act")
        items.push(`- ${field}, "${f.span}": ${failureDetail(f)}`);
    for (const d of j.drops)
      if (d.fields.includes(field))
        items.push(
          `- ${field}, "${d.sentence}": ${dropDetail(d, fx, counted)}`
        );
    lines.push(...items.slice(0, 3));
  }
  return `[Redo ${targets.map((f) => `"${f}"`).join(" and ")} and return the whole object; copy every other field exactly as it was. The app could not stand behind this:
${lines.join("\n")}
Name no move but ${list(fx.ownLabels)}, and write no number.]`;
}

// ── Reading a reply ─────────────────────────────────────────────────────────

function readReply(
  content: string
): { envelope: MomentEnvelope; parse: FieldedParse; repairs: string[] } | null {
  const parsed = parseMomentEnvelope(content);
  if (parsed) {
    const norm = normalizeEnvelope(parsed.envelope);
    const repairs = [
      ...parsed.repairs.map((r) =>
        r.startsWith("dropped:") ? "dropped_key" : r
      ),
      ...norm.repairs,
    ];
    return {
      envelope: norm.envelope,
      parse: parsed.repairs.length > 0 ? "repaired" : "clean",
      repairs: Array.from(new Set(repairs)),
    };
  }
  if (content.trim().length > 0 && !content.includes("{")) {
    const lifted = momentFromFollowUpText(content);
    const norm = normalizeEnvelope({
      idea: lifted.idea ?? "",
      happens: lifted.happens ?? "",
      proof: lifted.proof,
      lesson: lifted.lesson,
      question: lifted.question,
    });
    return { envelope: norm.envelope, parse: "prose", repairs: norm.repairs };
  }
  return null;
}

function tally(j: Judgement): {
  checks: Record<string, number>;
  referee: Record<string, number>;
} {
  const checks: Record<string, number> = {};
  for (const f of j.failures) {
    const key = `${f.field}.${f.check}.${f.kind}.${MOMENT_CHECK_ARMING[f.check]}`;
    checks[key] = (checks[key] ?? 0) + 1;
  }
  const referee: Record<string, number> = {};
  for (const d of j.drops) {
    const kind = d.reason.split(":")[0];
    for (const f of d.fields) {
      const key = `${f}.${kind}`;
      referee[key] = (referee[key] ?? 0) + 1;
    }
  }
  return { checks, referee };
}

function pick(
  env: MomentEnvelope,
  field: MomentProseField
): Partial<MomentEnvelope> {
  return { [field]: env[field] } as Partial<MomentEnvelope>;
}

// ── The turn ────────────────────────────────────────────────────────────────

export async function runFieldedTurn(i: {
  /** The fielded request: the v1 request with the fielded system prompt, reminder and schema. */
  request: CallLLMOptions;
  /** The v1 request on the same turn, for a reply that cannot be read at all. */
  v1Request: CallLLMOptions;
  fx: FieldedMomentFacts;
  /** The follow-up referee with this turn's inputs, logging nothing. */
  referee: (text: string) => FollowUpRefereeResult;
  callLLM: (o: CallLLMOptions) => Promise<LLMResult>;
  signal?: AbortSignal;
  regenBudgetMs?: number;
  checkProse?: (text: string, signal?: AbortSignal) => Promise<ValidatorResult>;
}): Promise<FieldedTurnResult> {
  const { fx, referee, signal } = i;
  const budget = i.regenBudgetMs ?? FIELDED_REGEN_BUDGET_MS;
  const calls: LLMResult[] = [];

  const r1 = await i.callLLM({ ...i.request, signal });
  calls.push(r1);
  const read1 = readReply(r1.content);

  const counter: FieldedCounter = {
    served: "fielded",
    parse: read1?.parse ?? "failed",
    repairs: read1?.repairs ?? [],
    calls: 0,
    providers: [],
    llmMs: [],
    retryCount: 0,
    regenerated: [],
    regenAborted: false,
    first: {},
    second: {},
    firstReferee: {},
    secondReferee: {},
    omitted: [],
    clauses: 0,
    proofKind: null,
    openingWords: 0,
    lessonWords: 0,
    proseValidator: i.checkProse ? "ran" : "absent",
    proseIssues: 0,
  };
  const finishCalls = () => {
    counter.calls = calls.length;
    counter.providers = calls.map((c) => c.provider);
    counter.llmMs = calls.map((c) => c.elapsedMs);
  };

  if (!read1) {
    // Nothing to read: the v1 answer to the same turn, served as v1.
    const r2 = await i.callLLM({ ...i.v1Request, signal });
    calls.push(r2);
    counter.served = "v1_fallback";
    counter.retryCount = 1;
    counter.proseValidator = "absent";
    finishCalls();
    return {
      served: "v1_fallback",
      text: r2.content,
      prose: null,
      calls,
      retryCount: 1,
      proseIssues: [],
      proseTelemetry: [],
      proseCostUsd: 0,
      envelope1: null,
      counter,
    };
  }

  const env1 = read1.envelope;
  // The prose validator reads call 1's projection while the checks run;
  // caught here, so an abort is never an unhandled rejection.
  const pc: Promise<ValidatorResult | null> = i.checkProse
    ? i
        .checkProse(momentToText(proseFromEnvelope(env1)), signal)
        .catch(() => null)
    : Promise.resolve(null);

  const j1 = judge(env1, fx, referee);
  const t1 = tally(j1);
  counter.first = t1.checks;
  counter.firstReferee = t1.referee;

  const chosen: MomentEnvelope = { ...env1 };
  const omit = new Set<MomentProseField>();

  if (j1.failed.size > 0) {
    const targets = UNITS.filter((u) => u.some((f) => j1.failed.has(f))).flat();
    counter.regenerated = [...targets];
    counter.retryCount = 1;
    const timeout = AbortSignal.timeout(budget);
    const retrySignal = signal
      ? (AbortSignal as unknown as { any(s: AbortSignal[]): AbortSignal }).any([
          signal,
          timeout,
        ])
      : timeout;
    let env2: MomentEnvelope | null = null;
    try {
      const r2 = await i.callLLM({
        ...i.request,
        messages: [
          ...i.request.messages,
          { role: "assistant", content: r1.content },
          { role: "user", content: buildFieldRetryTurn(targets, j1, fx) },
        ],
        signal: retrySignal,
      });
      calls.push(r2);
      env2 = readReply(r2.content)?.envelope ?? null;
    } catch (err) {
      if (signal?.aborted) throw err;
      counter.regenAborted = true;
      env2 = null;
    }

    const cand: MomentEnvelope = { ...env1 };
    if (env2) for (const f of targets) Object.assign(cand, pick(env2, f));
    const j2 = env2 ? judge(cand, fx, referee) : null;
    if (j2) {
      const t2 = tally(j2);
      counter.second = t2.checks;
      counter.secondReferee = t2.referee;
    }
    for (const f of targets) {
      if (j2 && !j2.failed.has(f)) Object.assign(chosen, pick(cand, f));
      else if (!j1.failed.has(f)) Object.assign(chosen, pick(env1, f));
      else omit.add(f);
    }
  }

  // A proof the facts cannot resolve is absent whether or not it failed.
  if (
    chosen.proof &&
    !omit.has("proof") &&
    !resolveProof(chosen.proof, fx.facts)
  )
    omit.add("proof");

  const prose: MomentProse = {
    idea: omit.has("idea") ? null : chosen.idea,
    happens: omit.has("happens") ? null : chosen.happens,
    proof: omit.has("proof") ? null : chosen.proof,
    lesson: omit.has("lesson") ? null : chosen.lesson,
    question: omit.has("question") ? null : chosen.question,
    more: null,
    omitted: FIELDS.filter((f) => omit.has(f)),
  };
  const text = momentToText(prose);

  const pv = await pc;
  if (i.checkProse && !pv) counter.proseValidator = "failed";
  const proseIssues = pv?.issues ?? [];
  const flaggedSpans = proseIssues
    .filter((x) => x.severity === "error")
    .map((x) => x.llm_span)
    .filter((s) => typeof s === "string" && s.length > 0);

  counter.omitted = prose.omitted;
  counter.clauses = prose.omitted.filter(
    (f) => f === "idea" || f === "happens" || f === "proof"
  ).length;
  counter.proofKind = prose.proof?.kind ?? null;
  counter.openingWords =
    countProseWords(prose.idea ?? "") + countProseWords(prose.happens ?? "");
  counter.lessonWords = prose.lesson
    ? countProseWords(prose.lesson.pattern) +
      countProseWords(prose.lesson.check)
    : 0;
  counter.proseIssues = proseIssues.length;
  finishCalls();

  return {
    served: "fielded",
    text,
    prose,
    calls,
    retryCount: counter.retryCount,
    ...(flaggedSpans.length > 0 ? { flaggedSpans } : {}),
    proseIssues,
    proseTelemetry: pv?.telemetry ?? [],
    proseCostUsd: pv?.costUsd ?? 0,
    envelope1: env1,
    counter,
  };
}

/**
 * The turn as the validators-on branch reports a pipeline result, so the
 * timeout race, the telemetry forwarder and the response read it unchanged.
 * Never `fallback_used`: an omitted field is a checked answer, not the
 * template.
 */
export function fieldedAsRegenerateResult(
  out: FieldedTurnResult,
  ctx: {
    correlationId: string;
    fen: string;
    moveSan: string;
    playerPerspective: "white" | "black";
  }
): RegenerateResult {
  const context = {
    fen: ctx.fen,
    move_san: ctx.moveSan,
    player_perspective: ctx.playerPerspective,
    correlation_id: ctx.correlationId,
  };
  const skip = (check_name: string) =>
    createTelemetryEvent({
      check_name,
      fire_reason: "skip_fielded_turn",
      expected: { fielded: true },
      actual: {},
      context,
    });
  const callCost = out.calls.reduce(
    (sum, c) =>
      sum +
      (estimateCostUSD({
        model: c.model,
        inputTokens: c.inputTokens,
        outputTokens: c.outputTokens,
        cacheCreationTokens: c.cacheCreationTokens,
        cacheReadTokens: c.cacheReadTokens,
      }) ?? 0),
    0
  );
  return {
    finalResponse: out.text,
    retryCount: out.retryCount,
    finalOutcome: out.retryCount ? "passed_after_retry" : "passed_initial",
    cumulativeIssues: out.proseIssues,
    totalCostUsd: callCost + out.proseCostUsd,
    telemetry: [
      skip("eval_claim"),
      skip("feature_citation"),
      ...out.proseTelemetry,
    ],
  };
}

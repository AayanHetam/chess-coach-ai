/**
 * The follow-up results contract (pathway 3.7). The keyed probes write their
 * turns only through `recordTurn` and `writeFollowUpResults`, and the replay
 * gate (scripts/eval/replay/gate.ts) reads them only through
 * `followUpResultsV1`, so a probe and the gate cannot drift apart. A file
 * carries its schema marker and version, the commit and machine it ran on,
 * the prompt versions in force, and one record per turn: the question, the
 * flags read before the request, the served text and what the route echoed.
 *
 * A results file is named by its start time to the second, so a run never
 * overwrites another.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { z } from "zod";
import { FOLLOWUP_PROMPT_VERSION } from "@/lib/prompts/followUpPrompt";
import { FIELDED_PROMPT_VERSION } from "@/lib/prompts/fieldedFollowUpPrompt";
import {
  FOLLOWUP_GRAMMAR_VERSION,
  INTENT_ROUTER_VERSION,
} from "@/lib/coach/intentTable";
import { PERSPECTIVE_CLAUSE_VERSION } from "@/lib/coach/questionPerspective";

export const FOLLOWUP_RESULTS_SCHEMA = "chessmasti.followup-results";
export const FOLLOWUP_RESULTS_VERSION = 1;

/** The server flags a turn's behaviour depends on, recorded before each request. */
export const RECORDED_FLAGS = [
  "COACH_FOLLOWUP_PROMPT",
  "COACH_FOLLOWUP_LEAN",
  "COACH_INTENT_ROUTER",
  "COACH_PERSPECTIVE",
  "COACH_WHATIF_EVALS",
  "COACH_COMPARE",
  "COACH_ONE_MASTI",
  "MASTERMIND_VALIDATORS_ENABLED",
  "CONTRACT_CATEGORIES",
] as const;
export type RecordedFlag = (typeof RECORDED_FLAGS)[number];

export const PROBE_NAMES = [
  "intent-router",
  "followup-fielded",
  "followup-perspective",
  "followup-compare",
] as const;
export type ProbeName = (typeof PROBE_NAMES)[number];

/** Every recorded flag as the process holds it now, "" for an unset one. */
export function flagsNow(): Record<RecordedFlag, string> {
  const out = {} as Record<RecordedFlag, string>;
  for (const f of RECORDED_FLAGS) out[f] = process.env[f] ?? "";
  return out;
}

/** The first 16 hex of sha256 over the game and its evaluation. */
export function fixtureDigest(fx: {
  moveHistory: string[];
  gameEval: unknown;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([fx.moveHistory, fx.gameEval]))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Flags recorded since a later pathway PR (COACH_COMPARE, 3.5a): a file
 * written before one was recorded leaves it out, and it is read as unset.
 */
const LATER_FLAGS: readonly RecordedFlag[] = ["COACH_COMPARE"];

const flagsSchema = z.preprocess(
  (v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? {
          ...Object.fromEntries(LATER_FLAGS.map((f) => [f, ""])),
          ...(v as Record<string, unknown>),
        }
      : v,
  z.record(z.enum(RECORDED_FLAGS), z.string())
);

export const SERVED_BY = [
  "model",
  "page",
  "template",
  "referee_line",
  "draft",
] as const;
export type ServedBy = (typeof SERVED_BY)[number];

export const followUpTurnV1 = z.looseObject({
  id: z.string().regex(/^[a-z-]+:\d+$/),
  fixture: z.string().min(1),
  fixtureDigest: z.string().regex(/^[0-9a-f]{16}$/),
  playerColor: z.enum(["w", "b"]),
  moveIndex: z.number().int().min(0),
  question: z.string(),
  kind: z.string().min(1),
  origin: z.string().optional(),
  request: z.looseObject({
    perspective: z.unknown().optional(),
    conversationHistory: z.unknown().optional(),
    clientEvals: z.unknown().optional(),
  }),
  flags: flagsSchema,
  status: z.number().int(),
  served: z.string(),
  servedBy: z.enum(SERVED_BY),
  echo: z.looseObject({
    followUpPrompt: z.string().nullable(),
    followUpBudget: z.string().nullable(),
    anchor: z.unknown().nullable(),
    routing: z
      .looseObject({
        source: z.string(),
        rule: z.string(),
        intent: z.string(),
        grammar: z.string(),
      })
      .nullable(),
    perspective: z.unknown().nullable(),
    clientEvals: z.unknown().nullable(),
    pipeline: z
      .looseObject({
        category: z.string().optional(),
        categorySource: z.string().optional(),
        finalOutcome: z.string().optional(),
        servedFallback: z.string().optional(),
        servedDraft: z.boolean().optional(),
        classifierCostUsd: z.number().optional(),
      })
      .nullable(),
  }),
  refereeDrops: z.array(z.string()),
  fielded: z.looseObject({ served: z.string() }).nullable(),
  timing: z.looseObject({ elapsedMs: z.number() }).nullable(),
  harnessMs: z.number().min(0),
});
export type FollowUpTurn = z.infer<typeof followUpTurnV1>;

export const followUpResultsV1 = z.looseObject({
  schema: z.literal(FOLLOWUP_RESULTS_SCHEMA),
  schemaVersion: z.literal(FOLLOWUP_RESULTS_VERSION),
  probe: z.enum(PROBE_NAMES),
  startedAt: z.iso.datetime(),
  gitSha: z.string().nullable(),
  dirty: z.boolean().nullable(),
  environment: z.literal("in-process"),
  machine: z.object({
    platform: z.string(),
    node: z.string(),
    cpus: z.number().int(),
  }),
  tier: z.literal("fast"),
  versions: z.object({
    followUpPrompt: z.string(),
    fieldedPrompt: z.string(),
    router: z.string(),
    grammar: z.string(),
    perspective: z.string(),
  }),
  summary: z.unknown(),
  routerCalls: z.array(z.unknown()).optional(),
  extra: z.unknown().optional(),
  turns: z.array(followUpTurnV1).min(1),
});
export type FollowUpResults = z.infer<typeof followUpResultsV1>;

/** The prompt and router versions in force at HEAD, as a results file records them. */
export function currentVersions(): FollowUpResults["versions"] {
  return {
    followUpPrompt: FOLLOWUP_PROMPT_VERSION,
    fieldedPrompt: FIELDED_PROMPT_VERSION,
    router: INTENT_ROUTER_VERSION,
    grammar: FOLLOWUP_GRAMMAR_VERSION,
    perspective: PERSPECTIVE_CLAUSE_VERSION,
  };
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;

/**
 * Who wrote the served text: the page (an order the route answered with no
 * model call), the template or the referee's line in place of an answer,
 * the validators' rejected draft served refereed, or the model.
 */
export function servedByOf(gameAnalysis: unknown): ServedBy {
  const ga = obj(gameAnalysis);
  if (!ga) return "model";
  if (ga.served === "page") return "page";
  const pipeline = obj(ga.pipeline);
  if (pipeline?.servedFallback === "referee_line") return "referee_line";
  if (pipeline?.servedFallback === "template") return "template";
  if (pipeline?.servedDraft === true) return "draft";
  // Without the router the route serves the template with no
  // servedFallback echo: a rejected draft that was not served is the template.
  if (pipeline?.finalOutcome === "fallback_used") return "template";
  return "model";
}

export interface RecordTurnInput {
  probe: ProbeName;
  seq: number;
  fixture: string;
  fx: { moveHistory: string[]; gameEval: unknown };
  playerColor: "w" | "b";
  moveIndex: number;
  question: string;
  kind: string;
  origin?: string;
  request?: {
    perspective?: unknown;
    conversationHistory?: unknown;
    clientEvals?: unknown;
  };
  /** flagsNow(), taken immediately before the request. */
  flags: Record<RecordedFlag, string>;
  status: number;
  /** The route's JSON, whatever it held. */
  json: unknown;
  /** The structured log lines the route wrote during the request. */
  logged: ReadonlyArray<readonly [string, Record<string, unknown>]>;
  harnessMs: number;
}

/** One turn as the results file holds it. */
export function recordTurn(i: RecordTurnInput): FollowUpTurn {
  const ga = obj(obj(i.json)?.gameAnalysis);
  const field = (k: string): unknown => (ga && k in ga ? ga[k] : null);
  const str = (k: string): string | null =>
    typeof ga?.[k] === "string" ? (ga[k] as string) : null;
  const fielded =
    i.logged
      .filter(
        ([e, d]) => e === "followup_fielded" && typeof d.served === "string"
      )
      .map(([, d]) => d)
      .pop() ?? null;
  const timing = obj(ga?.timing);
  const request: FollowUpTurn["request"] = {};
  if (i.request?.perspective !== undefined)
    request.perspective = i.request.perspective;
  if (i.request?.conversationHistory !== undefined)
    request.conversationHistory = i.request.conversationHistory;
  if (i.request?.clientEvals !== undefined)
    request.clientEvals = i.request.clientEvals;
  return {
    id: `${i.probe}:${i.seq}`,
    fixture: i.fixture,
    fixtureDigest: fixtureDigest(i.fx),
    playerColor: i.playerColor,
    moveIndex: i.moveIndex,
    question: i.question,
    kind: i.kind,
    ...(i.origin !== undefined ? { origin: i.origin } : {}),
    request,
    flags: { ...i.flags },
    status: i.status,
    served: str("analysis") ?? "",
    servedBy: servedByOf(ga),
    echo: {
      followUpPrompt: str("followUpPrompt"),
      followUpBudget: str("followUpBudget"),
      anchor: field("anchor"),
      routing: (obj(ga?.routing) as FollowUpTurn["echo"]["routing"]) ?? null,
      perspective: field("perspective"),
      clientEvals: field("clientEvals"),
      pipeline: (obj(ga?.pipeline) as FollowUpTurn["echo"]["pipeline"]) ?? null,
    },
    refereeDrops: i.logged
      .filter(([e]) => e === "followup_referee_dropped")
      .flatMap(([, d]) =>
        Array.isArray(d.dropped) ? d.dropped.map(String) : []
      ),
    fielded: fielded as FollowUpTurn["fielded"],
    timing:
      timing && typeof timing.elapsedMs === "number"
        ? (timing as FollowUpTurn["timing"])
        : null,
    harnessMs: Math.max(0, i.harnessMs),
  };
}

function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, {
      stdio: ["ignore", "pipe", "ignore"],
    }).toString();
  } catch {
    return null;
  }
}

/** "2026-10-09T07:12:34.567Z" -> "2026-10-09T071234Z" */
export function resultsStamp(startedAt: string): string {
  return `${startedAt.slice(0, 19).replace(/:/g, "")}Z`;
}

/**
 * Validate and write one probe run. Throws on a file the schema refuses,
 * returns null with a warning when no turn was recorded, and returns the
 * path written otherwise.
 */
export function writeFollowUpResults(
  probe: ProbeName,
  startedAt: string,
  turns: FollowUpTurn[],
  extra: { summary: unknown; routerCalls?: unknown[]; extra?: unknown },
  dir = "scripts/eval/results"
): string | null {
  if (turns.length === 0) {
    console.warn(`${probe}: no turn was recorded, no results file written`);
    return null;
  }
  const sha = git("rev-parse HEAD");
  const status = git("status --porcelain");
  const file = {
    schema: FOLLOWUP_RESULTS_SCHEMA,
    schemaVersion: FOLLOWUP_RESULTS_VERSION,
    probe,
    startedAt,
    gitSha: sha ? sha.trim() : null,
    dirty: status === null ? null : status.trim().length > 0,
    environment: "in-process" as const,
    machine: {
      platform: process.platform,
      node: process.version,
      cpus: os.cpus().length,
    },
    tier: "fast" as const,
    versions: currentVersions(),
    summary: extra.summary,
    ...(extra.routerCalls ? { routerCalls: extra.routerCalls } : {}),
    ...(extra.extra !== undefined ? { extra: extra.extra } : {}),
    turns,
  };
  const parsed = followUpResultsV1.safeParse(file);
  if (!parsed.success)
    throw new Error(
      `${probe}: the results file does not match ${FOLLOWUP_RESULTS_SCHEMA} v${FOLLOWUP_RESULTS_VERSION}: ${parsed.error.issues
        .slice(0, 5)
        .map((x) => `${x.path.join(".")} ${x.message}`)
        .join(", ")}`
    );
  const out = path.resolve(
    process.cwd(),
    dir,
    `${probe}-${resultsStamp(startedAt)}.json`
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
  return out;
}

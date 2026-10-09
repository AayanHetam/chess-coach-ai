/**
 * The key-less replay gate (pathway 3.7): the committed follow-up results
 * read back with no network and no key.
 *
 * It fails only on what must never ship or never drift: a changed or broken
 * corpus, a network attempt, a numbered move in served text that no board
 * the game reaches at that ply can play, a question the page writes routed
 * by the model, a turn making more than one routing call, a drift in the
 * story probe's pins, and a missed bar for a flag listed as flipped.
 * Everything else it measures (latency on each clock, words at rest, proof
 * tokens, eval figures, the referee's drops, the router's calls) is printed
 * and never fails it.
 *
 * The report is plain fixed-width text with no clock time and no absolute
 * path, so the same input gives the same bytes.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { readCsv } from "../lib/csv";
import {
  compactForFixture,
  loadRealFixture,
  type RealFixture,
} from "../lib/fixtureContract";
import {
  FOLLOWUP_RESULTS_SCHEMA,
  FOLLOWUP_RESULTS_VERSION,
  PROBE_NAMES,
  RECORDED_FLAGS,
  currentVersions,
  fixtureDigest,
  followUpResultsV1,
  type FollowUpResults,
  type FollowUpTurn,
  type ProbeName,
} from "../lib/followUpRecord";
import {
  REPLAY_MANIFEST,
  REPLAY_TARGETS,
  type FlippableFlag,
  type ReplayManifest,
} from "./manifest";
import {
  atRest,
  evalFigures,
  pctl,
  plyTable,
  proofTokens,
  readMoves,
  type MoveClass,
  type MoveReading,
  type PlyTable,
} from "./oracle";
import { refereeFollowUp } from "@/lib/contract/followUpReferee";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import type { CompactContract } from "@/lib/contract/followUp";
import { countProseWords } from "@/lib/coach/moment";
import { isWalkthroughQuestion } from "@/lib/coach/questionShape";
import {
  FOLLOWUP_BUDGET,
  FOLLOWUP_LEAN_BUDGET,
  getFollowUpPromptMode,
  isFollowUpLean,
} from "@/lib/prompts/followUpPrompt";
import {
  finishTurnRoute,
  isIntentRouterEnabled,
} from "@/lib/coach/intentTable";
import { isPerspectiveEnabled } from "@/lib/coach/questionPerspective";
import { parseMastermindFlag } from "@/env";
import { resolveQuestionAnchor } from "@/lib/coach/questionAnchor";
import { resolveLiveIntent } from "@/lib/coach/intentRules";
import {
  verifyClientEvals,
  type VerifiedWhatIf,
} from "@/lib/coach/clientEvals";
import {
  __resetFetchForTesting,
  __setFetchForTesting,
} from "@/lib/grounding/chessdb";

// ── Types ───────────────────────────────────────────────────────────────────

export interface GateFailure {
  check: string;
  file?: string;
  turn?: string;
  detail: string;
}

export interface GateReport {
  failures: GateFailure[];
  acknowledged: GateFailure[];
  fixedSinceHead: GateFailure[];
  sections: string[][];
  exit: string[];
  /** Every latency group, each on its own clock, for the tests. */
  latency: LatencyGroup[];
  /** Every mention and drop, printed with --verbose. */
  details: string[];
}

export interface LatencyGroup {
  group: string;
  clock: "route" | "harness" | "client-http";
  n: number;
  p50: number | null;
  p95: number | null;
}

interface StoryProbeFile {
  results: {
    fixture: string;
    question: string;
    with: { answer: string };
    without: { answer: string };
  }[];
}

interface EngineProbeFile {
  invariantFailures: number;
  byDepth?: Record<string, { msMedian?: number; msMax?: number }>;
  results: { ok: boolean }[];
}

interface Intent60 {
  fixture: string;
  playerColor: "w" | "b";
  rows: {
    id: number;
    q: string;
    origin: string;
    moveIndex: number;
    expect: { rule: string | null; grammar: string };
  }[];
}

export interface FrozenFile<T> {
  file: string;
  /** The file's sha256, null when it could not be read. */
  sha256: string | null;
  data: T | null;
  error?: string;
}

export interface DeclaredRun {
  file: string;
  results: FollowUpResults;
}

export interface GateInput {
  frozen: {
    storyProbe: FrozenFile<StoryProbeFile>;
    testerCsv: FrozenFile<string[][]>;
    engineProbe: FrozenFile<EngineProbeFile>;
  };
  declared: DeclaredRun[];
  /** Files in the results directory with no results marker. */
  notRead: string[];
  /** A file that is not JSON, refuses the schema or is newer than the gate. */
  loadFailures: GateFailure[];
  fixtures: ReadonlyMap<string, RealFixture>;
  intent60: Intent60 | null;
}

// ── Offline guard ───────────────────────────────────────────────────────────

const OFFLINE = "network disabled in the replay gate";

function hostOf(input: unknown): string {
  try {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : String((input as { url?: unknown })?.url ?? input);
    return new URL(url).host || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Trap every fetch (recording the host) and stub chessdb, which the
 * contract builder may ask for an outcome.
 */
export function installOfflineGuards(): {
  attempts: string[];
  restore(): void;
} {
  const attempts: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    attempts.push(hostOf(input));
    throw new Error(OFFLINE);
  }) as typeof fetch;
  __setFetchForTesting((() =>
    Promise.reject(new Error(OFFLINE))) as unknown as typeof fetch);
  return {
    attempts,
    restore() {
      globalThis.fetch = original;
      __resetFetchForTesting();
    },
  };
}

// ── Loading ─────────────────────────────────────────────────────────────────

const RESULTS_DIR = "scripts/eval/results";
const INTENT_60 = "src/lib/coach/__tests__/fixtures/intent-60.json";

const sha256 = (b: Buffer | string) =>
  createHash("sha256").update(b).digest("hex");

/** A path the report can print: repo-relative, or `extra/<name>` outside it. */
function displayPath(repoRoot: string, abs: string): string {
  const rel = path.relative(repoRoot, abs);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel))
    return rel.split(path.sep).join("/");
  return `extra/${path.basename(abs)}`;
}

function readFrozen<T>(
  repoRoot: string,
  file: string,
  parse: (text: string) => T
): FrozenFile<T> {
  const abs = path.join(repoRoot, file);
  if (!fs.existsSync(abs))
    return { file, sha256: null, data: null, error: "missing" };
  const bytes = fs.readFileSync(abs);
  try {
    return { file, sha256: sha256(bytes), data: parse(bytes.toString("utf8")) };
  } catch {
    return { file, sha256: sha256(bytes), data: null, error: "unreadable" };
  }
}

export async function loadGateInput(o: {
  repoRoot: string;
  extra?: string[];
  manifest?: ReplayManifest;
}): Promise<GateInput> {
  const manifest = o.manifest ?? REPLAY_MANIFEST;
  const root = o.repoRoot;
  const frozen: GateInput["frozen"] = {
    storyProbe: readFrozen(
      root,
      manifest.storyProbe.file,
      (t) => JSON.parse(t) as StoryProbeFile
    ),
    testerCsv: readFrozen(root, manifest.testerCsv.file, (t) => readCsv(t)),
    engineProbe: readFrozen(
      root,
      manifest.engineProbe.file,
      (t) => JSON.parse(t) as EngineProbeFile
    ),
  };

  const dir = path.join(root, RESULTS_DIR);
  const found = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => path.join(dir, f))
    : [];
  const files = Array.from(
    new Set([...found, ...(o.extra ?? []).map((p) => path.resolve(root, p))])
  );

  const declared: DeclaredRun[] = [];
  const notRead: string[] = [];
  const loadFailures: GateFailure[] = [];
  for (const abs of files) {
    const file = displayPath(root, abs);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(abs, "utf8"));
    } catch {
      loadFailures.push({ check: "corpus", file, detail: "not JSON" });
      continue;
    }
    const marked =
      !!raw &&
      typeof raw === "object" &&
      (raw as { schema?: unknown }).schema === FOLLOWUP_RESULTS_SCHEMA;
    if (!marked) {
      notRead.push(file);
      continue;
    }
    const version = (raw as { schemaVersion?: unknown }).schemaVersion;
    if (typeof version === "number" && version > FOLLOWUP_RESULTS_VERSION) {
      loadFailures.push({
        check: "corpus",
        file,
        detail: `schemaVersion ${version} was written by a newer probe than this gate`,
      });
      continue;
    }
    const parsed = followUpResultsV1.safeParse(raw);
    if (!parsed.success) {
      loadFailures.push({
        check: "corpus",
        file,
        detail: `the results schema refuses it: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
          .join(", ")}`,
      });
      continue;
    }
    declared.push({ file, results: parsed.data });
  }

  let intent60: Intent60 | null = null;
  try {
    intent60 = JSON.parse(
      fs.readFileSync(path.join(root, INTENT_60), "utf8")
    ) as Intent60;
  } catch {
    intent60 = null;
  }

  const names = new Set<string>();
  for (const r of frozen.storyProbe.data?.results ?? []) names.add(r.fixture);
  if (intent60) names.add(intent60.fixture);
  for (const d of declared)
    for (const t of d.results.turns) names.add(t.fixture);
  const fixtures = new Map<string, RealFixture>();
  for (const name of Array.from(names).sort()) {
    const fx = loadRealFixture(root, name);
    if (fx) fixtures.set(name, fx);
  }

  return { frozen, declared, notRead, loadFailures, fixtures, intent60 };
}

// ── Configuration ───────────────────────────────────────────────────────────

export interface TurnConfig {
  prompt: "v1" | "fielded" | "legacy";
  lean: boolean;
  router: boolean;
  perspective: boolean;
  validators: boolean;
}

/** Run `fn` with exactly these recorded flags in the environment, then put it back. */
function withEnv<T>(flags: Record<string, string>, fn: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const k of RECORDED_FLAGS) {
    saved.set(k, process.env[k]);
    const v = flags[k];
    if (typeof v === "string" && v !== "") process.env[k] = v;
    else delete process.env[k];
  }
  try {
    return fn();
  } finally {
    saved.forEach((v, k) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  }
}

/** The turn's configuration, read by HEAD's own flag readers from its recorded flags. */
export function configOf(flags: Record<string, string>): TurnConfig {
  return withEnv(flags, () => ({
    prompt: getFollowUpPromptMode(),
    lean: isFollowUpLean(),
    router: isIntentRouterEnabled(),
    perspective: isPerspectiveEnabled(),
    validators: parseMastermindFlag(process.env.MASTERMIND_VALIDATORS_ENABLED),
  }));
}

function configLabel(c: TurnConfig): string {
  return `${c.prompt}${c.lean ? "+lean" : ""}${c.router ? "+router" : ""}${
    c.perspective ? "+perspective" : ""
  }, validators ${c.validators ? "on" : "off"}`;
}

const DEFAULT_FLAG_READERS: Record<FlippableFlag, () => boolean> = {
  COACH_FOLLOWUP_LEAN: () => withEnv({}, isFollowUpLean),
  "COACH_FOLLOWUP_PROMPT=fielded": () =>
    withEnv({}, () => getFollowUpPromptMode() === "fielded"),
  COACH_INTENT_ROUTER: () => withEnv({}, isIntentRouterEnabled),
};

const FLAGS: readonly FlippableFlag[] = [
  "COACH_FOLLOWUP_LEAN",
  "COACH_FOLLOWUP_PROMPT=fielded",
  "COACH_INTENT_ROUTER",
];

/** The probe whose run a flip is held to, and the versions that run must match. */
const FLIP_PROBE: Record<
  FlippableFlag,
  { probe: ProbeName; versions: (keyof FollowUpResults["versions"])[] }
> = {
  COACH_FOLLOWUP_LEAN: {
    probe: "followup-fielded",
    versions: ["followUpPrompt"],
  },
  "COACH_FOLLOWUP_PROMPT=fielded": {
    probe: "followup-fielded",
    versions: ["fieldedPrompt", "followUpPrompt"],
  },
  COACH_INTENT_ROUTER: {
    probe: "intent-router",
    versions: ["router", "grammar"],
  },
};

const PROBE_COMMANDS: Record<ProbeName, string[]> = {
  "intent-router": [
    "INTENT_ROUTER_PROBE=1 npx vitest run scripts/eval/__tests__/intentRouter.keyed.test.ts",
  ],
  "followup-fielded": [
    "COACH_FOLLOWUP_LEAN=1 FIELDED_PROBE=1 npx vitest run scripts/eval/__tests__/followupFielded.keyed.test.ts",
    "and FIELDED_PROBE_VALIDATORS=1 with it for the other wing",
  ],
  "followup-perspective": [
    "PERSPECTIVE_PROBE=1 npx vitest run scripts/eval/__tests__/followupPerspective.keyed.test.ts",
  ],
  "followup-compare": [
    "COMPARE_PROBE=1 npx vitest run scripts/eval/__tests__/followupCompare.keyed.test.ts",
    "and COMPARE_PROBE_VALIDATORS=1 with it for the other wing",
  ],
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const compactCache = new Map<string, Promise<CompactContract>>();

/** Contracts are built lazily, once per fixture, game and side. */
function compactOf(
  name: string,
  fx: RealFixture,
  colour: "w" | "b" | undefined
): Promise<CompactContract> {
  const key = `${name}:${fixtureDigest(fx)}:${colour ?? ""}`;
  let p = compactCache.get(key);
  if (!p) {
    p = compactForFixture(fx, colour);
    compactCache.set(key, p);
  }
  return p;
}

const plural = (n: number, word: string, many = `${word}s`) =>
  `${n} ${n === 1 ? word : many}`;
const ms = (v: number | null) => (v === null ? "n/a" : `${Math.round(v)} ms`);
const num = (v: number | null) => (v === null ? "n/a" : String(v));
const short = (sha: string | null) => (sha ? sha.slice(0, 16) : "none");

/** A move class in the report's words. */
const CLASS_WORDS: Record<MoveClass, string> = {
  computed: "computed",
  alternative: "an alternative",
  offLine: "off the line",
  illegal: "illegal",
  past: "past the game's end",
  unmeasured: "unmeasured",
};

function countClasses(rs: readonly MoveReading[]): Record<MoveClass, number> {
  const c: Record<MoveClass, number> = {
    computed: 0,
    alternative: 0,
    offLine: 0,
    illegal: 0,
    past: 0,
    unmeasured: 0,
  };
  for (const r of rs) c[r.cls] += 1;
  return c;
}

function classLine(c: Record<MoveClass, number>): string {
  return `${c.computed} computed, ${plural(c.alternative, "alternative")}, ${c.offLine} off the line, ${c.illegal} illegal, ${c.past} past${
    c.unmeasured ? `, ${c.unmeasured} unmeasured` : ""
  }`;
}

const routingOf = (t: FollowUpTurn) => t.echo.routing;
const grammarOf = (t: FollowUpTurn) => routingOf(t)?.grammar;

/** Routing calls a turn made: the router, and the classifier when the validators ran it. */
function routingCalls(t: FollowUpTurn, c: TurnConfig): number {
  const pipeline = t.echo.pipeline;
  return (
    (routingOf(t)?.model ? 1 : 0) +
    (c.validators && pipeline && pipeline.categorySource !== "routed" ? 1 : 0)
  );
}

function budgetFor(t: FollowUpTurn, c: TurnConfig): number | null {
  if (c.prompt === "legacy") return null;
  const b = c.lean ? FOLLOWUP_LEAN_BUDGET : FOLLOWUP_BUDGET;
  return isWalkthroughQuestion(t.question) ? b.walkthroughWords : b.words;
}

const atRestTurn = (t: FollowUpTurn) =>
  atRest({
    status: t.status,
    served: t.served,
    servedBy: t.servedBy,
    question: t.question,
    grammar: grammarOf(t),
  });

/** A served answer the gate reads the moves of: a 200 the model or its draft wrote. */
const answered = (t: FollowUpTurn) =>
  t.status === 200 &&
  t.servedBy !== "page" &&
  t.servedBy !== "template" &&
  t.servedBy !== "referee_line";

function tally(xs: readonly string[]): string {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  const parts = Array.from(m.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, n]) => `${k} ${n}`);
  return parts.length ? parts.join(", ") : "none";
}

// ── The gate ────────────────────────────────────────────────────────────────

interface Finding extends GateFailure {
  fixed: boolean;
}

interface TurnReading {
  run: DeclaredRun;
  turn: FollowUpTurn;
  config: TurnConfig;
  /** Null when the turn's moves could not be measured. */
  moves: MoveReading[] | null;
  notMeasured?: string;
  fx: RealFixture | null;
}

export async function runGate(
  input: GateInput,
  manifest: ReplayManifest = REPLAY_MANIFEST,
  deps: {
    referee?: typeof refereeFollowUp;
    flagReaders?: Partial<Record<FlippableFlag, () => boolean>>;
  } = {}
): Promise<GateReport> {
  // The referee a served finding is re-read with ("fixed since HEAD").
  const referee = deps.referee ?? refereeFollowUp;
  // One configuration per set of flags, one table per game.
  const configs = new Map<string, TurnConfig>();
  const configFor = (t: FollowUpTurn) => {
    const key = JSON.stringify(t.flags);
    let c = configs.get(key);
    if (!c) {
      c = configOf(t.flags);
      configs.set(key, c);
    }
    return c;
  };
  const tables = new Map<string, PlyTable>();
  const tableFor = (name: string, fx: RealFixture) => {
    const key = `${name}:${fixtureDigest(fx)}`;
    let tb = tables.get(key);
    if (!tb) {
      tb = plyTable(fx.moveHistory, fx.gameEval.positions);
      tables.set(key, tb);
    }
    return tb;
  };
  const failures: GateFailure[] = [...input.loadFailures];
  const findings: Finding[] = [];
  const sections: string[][] = [];
  const details: string[] = [];
  const latency: LatencyGroup[] = [];

  // ── Corpora ──
  const corpora: string[] = ["== Corpora"];
  const frozenOk = (
    key: "storyProbe" | "testerCsv" | "engineProbe",
    label: string,
    rows: number | null,
    expectRows: number | null
  ): boolean => {
    const f = input.frozen[key];
    const pin = manifest[key];
    if (f.error === "missing") {
      failures.push({ check: "corpus", file: pin.file, detail: "missing" });
      corpora.push(`  ${label.padEnd(13)} ${pin.file}  MISSING`);
      return false;
    }
    let ok = true;
    if (f.sha256 !== pin.sha256) {
      ok = false;
      failures.push({
        check: "corpus",
        file: pin.file,
        detail: `the frozen corpus changed, re-pin it on purpose (sha256 ${short(f.sha256)}, pinned ${short(pin.sha256)})`,
      });
    }
    if (f.error || !f.data) {
      failures.push({ check: "corpus", file: pin.file, detail: "unreadable" });
      corpora.push(`  ${label.padEnd(13)} ${pin.file}  UNREADABLE`);
      return false;
    }
    if (expectRows !== null && rows !== expectRows) {
      ok = false;
      failures.push({
        check: "corpus",
        file: pin.file,
        detail: `${rows} rows, the manifest pins ${expectRows}`,
      });
    }
    corpora.push(
      `  ${label.padEnd(13)} ${pin.file}  sha256 ${short(f.sha256)} ${ok ? "ok" : "CHANGED"}${
        rows !== null ? `  ${plural(rows, "row")}` : ""
      }`
    );
    return ok;
  };
  const story = input.frozen.storyProbe.data;
  const storyOk = frozenOk(
    "storyProbe",
    "story probe",
    story?.results?.length ?? null,
    manifest.storyProbe.rows
  );
  const csvTable = input.frozen.testerCsv.data;
  const csvHeader = csvTable?.[0] ?? [];
  const csvRows = (csvTable ?? [])
    .slice(1)
    .filter((r) => r.length === csvHeader.length);
  const csvOk = frozenOk(
    "testerCsv",
    "tester csv",
    csvTable ? csvRows.length : null,
    manifest.testerCsv.rows
  );
  const engine = input.frozen.engineProbe.data;
  const engineOk = frozenOk("engineProbe", "engine probe", null, null);
  if (engine && engineOk) {
    const ok = engine.results.filter((r) => r.ok).length;
    corpora.push(
      `  engine probe  invariant failures ${engine.invariantFailures}, ${ok} of ${engine.results.length} ok`
    );
    if (engine.invariantFailures !== 0 || ok !== engine.results.length)
      failures.push({
        check: "engine",
        file: manifest.engineProbe.file,
        detail: `invariant failures ${engine.invariantFailures}, ${ok} of ${engine.results.length} ok`,
      });
  }

  // Declared runs: duplicates, fixtures, move indices.
  const readings: TurnReading[] = [];
  if (input.declared.length === 0) corpora.push("  declared runs none");
  for (const run of input.declared) {
    const r = run.results;
    corpora.push(
      `  declared      ${run.file}  ${r.probe}  ${r.startedAt}  ${plural(r.turns.length, "turn")}  git ${
        r.gitSha ? r.gitSha.slice(0, 7) : "unknown"
      }${r.dirty ? " dirty" : ""}`
    );
    const seen = new Set<string>();
    for (const t of r.turns) {
      if (seen.has(t.id)) {
        failures.push({
          check: "corpus",
          file: run.file,
          turn: t.id,
          detail: "duplicate turn id",
        });
        continue;
      }
      seen.add(t.id);
      const fx = input.fixtures.get(t.fixture) ?? null;
      if (!fx) {
        failures.push({
          check: "corpus",
          file: run.file,
          turn: t.id,
          detail: `unknown fixture ${t.fixture}`,
        });
        continue;
      }
      if (t.moveIndex < 0 || t.moveIndex > fx.moveHistory.length) {
        failures.push({
          check: "corpus",
          file: run.file,
          turn: t.id,
          detail: `moveIndex ${t.moveIndex} is outside 0 to ${fx.moveHistory.length}`,
        });
        continue;
      }
      readings.push({
        run,
        turn: t,
        config: configFor(t),
        moves: null,
        fx,
      });
    }
  }
  for (const probe of PROBE_NAMES) {
    if (input.declared.some((d) => d.results.probe === probe)) continue;
    corpora.push(`  ${probe}: no run yet. ${PROBE_COMMANDS[probe][0]}`);
    for (const more of PROBE_COMMANDS[probe].slice(1))
      corpora.push(`    ${more}`);
  }
  corpora.push(
    `  not read      ${plural(input.notRead.length, "file")} without the results marker`
  );
  for (const f of input.notRead) details.push(`not read ${f}`);
  sections.push(corpora);

  // ── Legality over declared turns ──
  for (const rd of readings) {
    const { turn: t, fx } = rd;
    if (t.status !== 200 || !fx) continue;
    if (fixtureDigest(fx) !== t.fixtureDigest) {
      rd.notMeasured = "the fixture changed since the run";
      continue;
    }
    let whatIf: VerifiedWhatIf | null = null;
    const ce = t.echo.clientEvals as {
      status?: unknown;
      compare?: unknown;
    } | null;
    if (t.request.clientEvals !== undefined && ce?.status === "verified") {
      // A compare (pathway 3.5) was verified with its second move read.
      const v = verifyClientEvals(
        t.request.clientEvals,
        {
          playedMoves: fx.moveHistory,
          gameEval: fx.gameEval as never,
        },
        ce.compare === true ? { compare: true } : undefined
      );
      if (!v.ok) {
        rd.notMeasured = `HEAD no longer verifies its what-if (${v.reason})`;
        continue;
      }
      whatIf = v.value;
    }
    const table = whatIf
      ? plyTable(fx.moveHistory, fx.gameEval.positions, whatIf)
      : tableFor(t.fixture, fx);
    rd.moves = readMoves(t.served, table);
    for (const m of rd.moves)
      details.push(
        `${rd.run.file} ${t.id}: ${m.mention} ${CLASS_WORDS[m.cls]}`
      );
    const bad = rd.moves.filter((m) => m.cls === "illegal" || m.cls === "past");
    if (bad.length === 0) continue;
    const compact = await compactOf(t.fixture, fx, t.playerColor);
    const ref = referee({
      reply: t.served,
      compact,
      activeFen: getFenAtHalfMove(fx.moveHistory, t.moveIndex),
      moveHistory: fx.moveHistory,
    });
    const left = new Set(
      readMoves(ref.text, table)
        .filter((m) => m.cls === "illegal" || m.cls === "past")
        .map((m) => `${m.mention}|${m.cls}`)
    );
    for (const b of bad)
      findings.push({
        check: "legality",
        file: rd.run.file,
        turn: t.id,
        detail: `${b.mention}: ${b.cls}${b.detail ? `, ${b.detail}` : ""}`,
        fixed: !left.has(`${b.mention}|${b.cls}`),
      });
  }

  // ── Routing over declared turns ──
  let typedMax: number | null = null;
  let typedTurns = 0;
  for (const rd of readings) {
    const { turn: t, config: c } = rd;
    if (!c.router || t.servedBy === "page") continue;
    const calls = routingCalls(t, c);
    const ui = (t.origin ?? "").startsWith("ui:");
    if (!ui) {
      typedTurns += 1;
      typedMax = Math.max(typedMax ?? 0, calls);
    }
    const source = routingOf(t)?.source ?? "nothing";
    if (ui && (source !== "rule" || calls > 0)) {
      let fixed = false;
      if (rd.fx) {
        const anchor = resolveQuestionAnchor(
          t.question,
          rd.fx.moveHistory,
          t.playerColor,
          t.moveIndex
        );
        fixed =
          resolveLiveIntent(t.question, {
            anchor,
            moves: rd.fx.moveHistory,
            playerColor: t.playerColor,
          }).source === "rule";
      }
      findings.push({
        check: "routing.ui",
        file: rd.run.file,
        turn: t.id,
        detail: `"${t.question}" routed by ${source} with ${plural(calls, "routing call")}`,
        fixed,
      });
    }
    if (calls > 1)
      findings.push({
        check: "routing.calls",
        file: rd.run.file,
        turn: t.id,
        detail: `${calls} routing calls on one turn`,
        fixed: false,
      });
  }

  // ── Findings: fixed since HEAD, acknowledged, or failed ──
  const fixedSinceHead: GateFailure[] = [];
  const acknowledged: GateFailure[] = [];
  const used = new Set<number>();
  const strip = (f: Finding): GateFailure => ({
    check: f.check,
    file: f.file,
    turn: f.turn,
    detail: f.detail,
  });
  for (const f of findings) {
    if (f.fixed) {
      fixedSinceHead.push(strip(f));
      continue;
    }
    const ack = manifest.acknowledged.findIndex(
      (a) =>
        a.file === f.file &&
        a.turn === f.turn &&
        a.check === f.check &&
        a.detail === f.detail
    );
    if (ack >= 0 && manifest.acknowledged[ack].reason.trim()) {
      used.add(ack);
      acknowledged.push(strip(f));
      continue;
    }
    failures.push(strip(f));
  }
  manifest.acknowledged.forEach((a, i) => {
    if (!a.reason.trim())
      failures.push({
        check: "acknowledgements",
        file: a.file,
        turn: a.turn,
        detail: `an acknowledgement needs a reason (${a.check}: ${a.detail})`,
      });
    else if (!used.has(i))
      failures.push({
        check: "acknowledgements",
        file: a.file,
        turn: a.turn,
        detail: `stale, it matches no finding (${a.check}: ${a.detail})`,
      });
  });

  // ── Moves in served text ──
  const groups = groupReadings(readings);
  const movesSection: string[] = ["== Moves in served text"];
  if (groups.length === 0) movesSection.push("  no declared run yet");
  for (const g of groups) {
    const measured = g.rows.filter((r) => r.moves !== null);
    const all = measured.flatMap((r) => r.moves ?? []);
    const servedText = g.rows.filter((r) => answered(r.turn));
    const figures = servedText.flatMap((r) => evalFigures(r.turn.served));
    const fieldedFigures = servedText
      .filter((r) => r.turn.fielded?.served === "fielded")
      .flatMap((r) => evalFigures(r.turn.served));
    movesSection.push(`  ${g.label}`);
    movesSection.push(
      `    ${plural(measured.length, "turn")} measured: ${classLine(countClasses(all))}`
    );
    const notMeasured = g.rows.filter((r) => r.notMeasured);
    if (notMeasured.length)
      movesSection.push(
        `    not measured: ${notMeasured
          .map((r) => `${r.turn.id} (${r.notMeasured})`)
          .join(", ")}`
      );
    movesSection.push(
      `    eval figures in prose: ${figures.length}${
        fieldedFigures.length
          ? `, ${fieldedFigures.length} on fielded turns`
          : ""
      }`
    );
    movesSection.push(
      `    second-net drops: ${tally(g.rows.flatMap((r) => r.turn.refereeDrops))}`
    );
    for (const r of g.rows)
      for (const d of r.turn.refereeDrops)
        details.push(`${g.file} ${r.turn.id}: drop ${d}`);
    movesSection.push(
      `    served by: ${tally(g.rows.map((r) => r.turn.servedBy))}`
    );
    const fielded = g.rows
      .map((r) => r.turn.fielded)
      .filter((f): f is NonNullable<FollowUpTurn["fielded"]> => !!f);
    if (fielded.length)
      movesSection.push(
        `    fielded counter: served ${tally(fielded.map((f) => String(f.served)))}, omitted ${tally(
          fielded.flatMap((f) =>
            Array.isArray(f.omitted) ? f.omitted.map(String) : []
          )
        )}`
      );
  }
  sections.push(movesSection);

  // ── Story probe ──
  const storySection: string[] = ["== Story probe (raw answers, pre-pathway)"];
  let storyRefereed: {
    illegal: number;
    past: number;
    offLine: number;
    figures: number;
  } | null = null;
  if (story && storyOk) {
    storySection.push(
      `  ${manifest.storyProbe.file}, ${plural(story.results.length, "question")}, ${plural(
        story.results.length * 2,
        "answer"
      )}, digest ok`
    );
    const raw: MoveReading[] = [];
    const refereed: MoveReading[] = [];
    const rawIllegal: string[] = [];
    const counts = {
      without: { sentences: 0, dropped: 0 },
      with: { sentences: 0, dropped: 0 },
    };
    const wordsRaw: number[] = [];
    const wordsRef: number[] = [];
    let figuresRaw = 0;
    let figuresRef = 0;
    let tokenLines = 0;
    for (let i = 0; i < story.results.length; i++) {
      const row = story.results[i];
      const fx = input.fixtures.get(row.fixture);
      if (!fx) {
        failures.push({
          check: "story",
          file: manifest.storyProbe.file,
          detail: `unknown fixture ${row.fixture}`,
        });
        continue;
      }
      const table = tableFor(row.fixture, fx);
      const compact = await compactOf(row.fixture, fx, fx.playerColor);
      const fen = getFenAtHalfMove(fx.moveHistory, fx.moveHistory.length);
      for (const arm of ["without", "with"] as const) {
        const answer = row[arm].answer;
        // The pins are HEAD's own referee's, never an injected one.
        const r = refereeFollowUp({
          reply: answer,
          compact,
          activeFen: fen,
          moveHistory: fx.moveHistory,
        });
        counts[arm].sentences += r.sentences;
        counts[arm].dropped += r.dropped.length;
        const a = readMoves(answer, table);
        const b = readMoves(r.text, table);
        raw.push(...a);
        refereed.push(...b);
        for (const m of a) {
          details.push(
            `story ${row.fixture}#${i} ${arm}: ${m.mention} ${CLASS_WORDS[m.cls]}`
          );
          if (m.cls === "illegal")
            rawIllegal.push(`${row.fixture}#${i} ${arm}: ${m.mention}`);
        }
        for (const d of r.dropped)
          details.push(
            `story ${row.fixture}#${i} ${arm}: drop [${d.reason}] ${d.sentence}`
          );
        figuresRaw += evalFigures(answer).length;
        figuresRef += evalFigures(r.text).length;
        tokenLines += proofTokens(answer, fx.moveHistory, fx.gameEval.positions)
          .onLine.length;
        if (!isWalkthroughQuestion(row.question)) {
          wordsRaw.push(countProseWords(answer));
          wordsRef.push(countProseWords(r.text));
        }
      }
    }
    const rawC = countClasses(raw);
    const refC = countClasses(refereed);
    const named = (rs: MoveReading[], cls: MoveClass) =>
      rs.filter((m) => m.cls === cls).map((m) => m.mention);
    storySection.push(
      `  raw: ${classLine(rawC)}${rawIllegal.length ? ` (illegal ${named(raw, "illegal").join(", ")})` : ""}`
    );
    storySection.push(
      `  HEAD's referee: ${counts.without.dropped} of ${counts.without.sentences} sentences dropped without stories, ${counts.with.dropped} of ${counts.with.sentences} with stories`
    );
    storySection.push(`  refereed: ${classLine(refC)}`);
    storySection.push(
      `  alternatives: raw ${named(raw, "alternative").join(", ") || "none"}, refereed ${
        named(refereed, "alternative").join(", ") || "none"
      }`
    );
    storySection.push(
      `  eval figures in prose: ${figuresRaw} raw, ${figuresRef} refereed`
    );
    storySection.push(`  token lines: ${tokenLines} raw`);
    storySection.push(
      `  words at rest: median ${num(pctl(wordsRaw, 0.5))} raw, ${num(pctl(wordsRef, 0.5))} refereed (${plural(
        wordsRaw.length,
        "answer"
      )})`
    );
    storyRefereed = {
      illegal: refC.illegal,
      past: refC.past,
      offLine: refC.offLine,
      figures: figuresRef,
    };

    // The pins.
    const pinDrift = (what: string, expected: string, actual: string) =>
      failures.push({
        check: "story",
        file: manifest.storyProbe.file,
        detail: `${what}: expected ${expected}, got ${actual}. Edit REPLAY_MANIFEST on purpose if the referee changed by design`,
      });
    const expectedIllegal =
      manifest.storyProbe.rawIllegal.join(" | ") || "none";
    const actualIllegal = rawIllegal.join(" | ") || "none";
    if (expectedIllegal !== actualIllegal)
      pinDrift("raw illegal moves", expectedIllegal, actualIllegal);
    for (const arm of ["without", "with"] as const) {
      const e = manifest.storyProbe.referee[arm];
      const a = counts[arm];
      if (e.sentences !== a.sentences || e.dropped !== a.dropped)
        pinDrift(
          `referee ${arm} stories`,
          `${e.dropped} of ${e.sentences}`,
          `${a.dropped} of ${a.sentences}`
        );
    }
    if (refC.illegal !== 0 || refC.past !== 0)
      failures.push({
        check: "story",
        file: manifest.storyProbe.file,
        detail: `after HEAD's referee ${refC.illegal} illegal and ${refC.past} past moves remain (${refereed
          .filter((m) => m.cls === "illegal" || m.cls === "past")
          .map((m) => m.mention)
          .join(", ")})`,
      });
  } else
    storySection.push("  not measured: the frozen file is missing or changed");
  sections.push(storySection);

  // ── Latency ──
  const lat: string[] = ["== Latency (route clock unless named)"];
  const col = (h: string) => csvHeader.indexOf(h);
  if (csvTable && csvOk) {
    const li = col("chat_latency_ms");
    const xs = csvRows
      .map((r) => Number(r[li]))
      .filter((v) => Number.isFinite(v));
    const g: LatencyGroup = {
      group: "tester csv",
      clock: "client-http",
      n: xs.length,
      p50: pctl(xs, 0.5),
      p95: pctl(xs, 0.95),
    };
    latency.push(g);
    lat.push(
      `  tester csv, client-http clock, pre-pathway baseline: ${plural(g.n, "turn")}, p50 ${ms(g.p50)}, p95 ${ms(g.p95)}`
    );
  }
  for (const g of groups) {
    const timed = g.rows.filter(
      (r) => r.turn.timing && r.turn.servedBy !== "page"
    );
    const series = (k: string) =>
      timed
        .map((r) => (r.turn.timing as Record<string, unknown>)[k])
        .filter((v): v is number => typeof v === "number");
    lat.push(`  ${g.label}`);
    for (const k of ["elapsedMs", "llmMs", "prepMs"]) {
      const xs = series(k);
      const entry: LatencyGroup = {
        group: `${g.label} ${k}`,
        clock: "route",
        n: xs.length,
        p50: pctl(xs, 0.5),
        p95: pctl(xs, 0.95),
      };
      latency.push(entry);
      lat.push(
        `    route ${k.padEnd(9)} n ${entry.n}, p50 ${ms(entry.p50)}, p95 ${ms(entry.p95)}`
      );
    }
    const hs = g.rows.map((r) => r.turn.harnessMs);
    const h: LatencyGroup = {
      group: `${g.label} harness`,
      clock: "harness",
      n: hs.length,
      p50: pctl(hs, 0.5),
      p95: pctl(hs, 0.95),
    };
    latency.push(h);
    lat.push(
      `    harness clock   n ${h.n}, p50 ${ms(h.p50)}, p95 ${ms(h.p95)}`
    );
  }
  const d12 = engine?.byDepth?.["12"];
  lat.push(
    `  what-if first line: held live by tests/e2e/local/coach-what-if.spec.ts:435 and :724 (${REPLAY_TARGETS.whatIfFirstLineMs} ms, both legs)${
      d12 && engineOk
        ? `, evaluateMoves headless depth 12 median ${ms(d12.msMedian ?? null)}, max ${ms(d12.msMax ?? null)}`
        : ""
    }`
  );
  sections.push(lat);

  // ── Words at rest ──
  const words: string[] = ["== Words at rest"];
  if (csvTable && csvOk) {
    const qi = col("student_question");
    const ri = col("chat_response");
    const si = col("http_status");
    const ws = csvRows
      .filter((r) => r[si] === "200" && !isWalkthroughQuestion(r[qi] ?? ""))
      .map((r) => countProseWords(r[ri] ?? ""));
    words.push(
      `  tester csv: ${plural(ws.length, "answer")} at rest, median ${num(pctl(ws, 0.5))} words, max ${num(
        ws.length ? Math.max(...ws) : null
      )}`
    );
  }
  for (const g of groups) {
    const rest = g.rows.filter((r) => atRestTurn(r.turn));
    const ws = rest.map((r) => countProseWords(r.turn.served));
    const judged = g.rows.filter(
      (r) => answered(r.turn) && grammarOf(r.turn) !== "acknowledgement"
    );
    const over = judged.filter((r) => {
      const b = budgetFor(r.turn, r.config);
      return b !== null && countProseWords(r.turn.served) > b;
    });
    words.push(
      `  ${g.label}: ${plural(ws.length, "answer")} at rest, median ${num(pctl(ws, 0.5))} words, ${over.length} of ${judged.length} over the turn's own budget`
    );
  }
  sections.push(words);

  // ── Proof tokens ──
  const tokens: string[] = ["== Proof tokens"];
  if (groups.length === 0) tokens.push("  no declared run yet");
  for (const g of groups) {
    tokens.push(`  ${g.label}`);
    const byGrammar = new Map<string, TurnReading[]>();
    for (const r of g.rows.filter((x) => answered(x.turn) && x.fx)) {
      const k = grammarOf(r.turn) ?? "no routing";
      byGrammar.set(k, [...(byGrammar.get(k) ?? []), r]);
    }
    Array.from(byGrammar.keys())
      .sort()
      .forEach((k) => {
        const rows = byGrammar.get(k) ?? [];
        const pts = rows.map((r) =>
          proofTokens(
            r.turn.served,
            r.fx!.moveHistory,
            r.fx!.gameEval.positions
          )
        );
        const withToken = pts.filter((p) => p.onLine.length > 0).length;
        const onLine = pts.flatMap((p) => p.onLine);
        tokens.push(
          `    ${k}: ${plural(rows.length, "turn")}, ${withToken} with a token, ${
            pts.filter((p) => p.onLine.length > 2).length
          } with more than two, ${pts.reduce((n, p) => n + p.inline, 0)} inline, ${
            onLine.filter((x) => x.kind === "maia").length
          } maia, ${onLine.filter((x) => !x.drawable).length} undrawable`
        );
      });
  }
  sections.push(tokens);

  // ── Router ──
  const router: string[] = ["== Router"];
  let uiRuled = 0;
  let uiTotal = 0;
  const rows60 = input.intent60?.rows ?? [];
  const fx60 = input.intent60
    ? input.fixtures.get(input.intent60.fixture)
    : null;
  if (!input.intent60 || !fx60) {
    failures.push({
      check: "rules",
      file: INTENT_60,
      detail: "the sixty questions could not be read",
    });
  } else {
    const moves = fx60.moveHistory;
    const colour = input.intent60.playerColor;
    let ruled = 0;
    for (const r of rows60) {
      const anchor = resolveQuestionAnchor(r.q, moves, colour, r.moveIndex);
      const route = finishTurnRoute({
        live: resolveLiveIntent(r.q, { anchor, moves, playerColor: colour }),
        model: null,
        question: r.q,
        anchored: !!anchor,
      });
      if (route.source === "rule") ruled += 1;
      if (!r.origin.startsWith("ui:")) continue;
      uiTotal += 1;
      const bare = resolveLiveIntent(r.q, {
        anchor: null,
        moves,
        playerColor: colour,
      });
      if (route.source === "rule" && bare.source === "rule") uiRuled += 1;
      else
        failures.push({
          check: "rules",
          file: INTENT_60,
          turn: `#${r.id}`,
          detail: `"${r.q}" is not routed by rule ${route.source === "rule" ? "without" : "with"} its anchor`,
        });
    }
    const pinned = rows60.filter((r) => r.expect.rule !== null).length;
    if (ruled !== pinned)
      failures.push({
        check: "rules",
        file: INTENT_60,
        detail: `the rules route ${ruled} of ${rows60.length}, the fixture pins ${pinned}`,
      });
    router.push(
      `  rules over intent-60: ${ruled} of ${rows60.length} by rule (the fixture pins ${pinned}), UI ${uiRuled} of ${uiTotal} with and without an anchor`
    );
  }
  const routerRuns = input.declared.filter(
    (d) => d.results.probe === "intent-router"
  );
  if (routerRuns.length === 0)
    router.push(
      `  router calls: no run yet. ${PROBE_COMMANDS["intent-router"][0]}`
    );
  for (const run of routerRuns) {
    const calls = (run.results.routerCalls ?? []) as {
      ms?: unknown;
      outcome?: unknown;
    }[];
    const xs = calls
      .map((c) => c.ms)
      .filter((v): v is number => typeof v === "number");
    const timeouts = calls.filter((c) => c.outcome === "timeout").length;
    router.push(
      `  router calls ${run.file}: ${plural(calls.length, "call")}, p50 ${ms(pctl(xs, 0.5))}, p95 ${ms(pctl(xs, 0.95))}, timeouts ${timeouts} of ${calls.length}`
    );
  }
  router.push(
    typedMax === null
      ? "  routing calls per typed turn: no recorded router turn yet"
      : `  routing calls per typed turn: recorded max ${typedMax} over ${plural(typedTurns, "turn")}`
  );
  sections.push(router);

  // ── Flips ──
  const flips: string[] = ["== Flips"];
  const readers = { ...DEFAULT_FLAG_READERS, ...(deps.flagReaders ?? {}) };
  const flipped = new Map<FlippableFlag, string>();
  for (const f of FLAGS) {
    if (manifest.flipped.includes(f)) flipped.set(f, "manifest");
    else if (readers[f]()) flipped.set(f, "code default");
  }
  const target = {
    prompt: flipped.has("COACH_FOLLOWUP_PROMPT=fielded")
      ? ("fielded" as const)
      : ("v1" as const),
    lean: flipped.has("COACH_FOLLOWUP_LEAN"),
    router: flipped.has("COACH_INTENT_ROUTER"),
  };
  const targetLabel = `${target.prompt}${target.lean ? "+lean" : ""}${target.router ? "+router" : ""}`;
  const atTarget = (c: TurnConfig, wing: boolean) =>
    c.prompt === target.prompt &&
    c.lean === target.lean &&
    c.router === target.router &&
    c.validators === wing;
  /** The newest run of the probe holding turns at the target on that wing. */
  const newestAtTarget = (probe: ProbeName, wing: boolean) => {
    const runs = input.declared.filter(
      (d) =>
        d.results.probe === probe &&
        d.results.turns.some((t) => atTarget(configFor(t), wing))
    );
    runs.sort((a, b) =>
      a.results.startedAt === b.results.startedAt
        ? a.file < b.file
          ? -1
          : 1
        : a.results.startedAt < b.results.startedAt
          ? -1
          : 1
    );
    return runs.length ? runs[runs.length - 1] : null;
  };
  if (flipped.size === 0)
    flips.push(
      "  flipped: none (the manifest lists none, the code defaults are off)"
    );
  const head = currentVersions();
  const flipFail = (detail: string, file?: string, turn?: string) =>
    failures.push({ check: "flips", file, turn, detail });
  flipped.forEach((source, flag) => {
    flips.push(`  ${flag}: flipped (${source}), target ${targetLabel}`);
    const { probe, versions } = FLIP_PROBE[flag];
    for (const wing of [false, true]) {
      const wingLabel = `validators ${wing ? "on" : "off"}`;
      const run = newestAtTarget(probe, wing);
      if (!run) {
        flipFail(
          `${flag}: no ${probe} run at the target configuration (${targetLabel}) on the ${wingLabel} wing`
        );
        flips.push(`    ${wingLabel}: no run at the target configuration`);
        continue;
      }
      const stale = versions.filter((k) => run.results.versions[k] !== head[k]);
      if (stale.length) {
        for (const k of stale)
          flipFail(
            `${flag}: the run is stale (versions.${k} ${run.results.versions[k]}, HEAD ${head[k]})`,
            run.file
          );
        flips.push(`    ${wingLabel}: ${run.file} is stale`);
        continue;
      }
      const turns = run.results.turns.filter((t) =>
        atTarget(configFor(t), wing)
      );
      if (flag === "COACH_FOLLOWUP_LEAN") {
        if (turns.length < REPLAY_TARGETS.minTurnsPerWing)
          flipFail(
            `${flag}: ${plural(turns.length, "target turn")} on the ${wingLabel} wing, the bar reads at least ${REPLAY_TARGETS.minTurnsPerWing}`,
            run.file
          );
        const non200 = turns.filter((t) => t.status !== 200).length;
        if (non200)
          flipFail(
            `${flag}: ${plural(non200, "turn")} did not return 200 on the ${wingLabel} wing`,
            run.file
          );
        const xs = turns
          .filter((t) => t.timing && t.servedBy !== "page")
          .map((t) => t.timing!.elapsedMs);
        const p50 = pctl(xs, 0.5);
        if (p50 === null || !(p50 < REPLAY_TARGETS.followUpP50Ms))
          flipFail(
            `${flag}: route p50 ${ms(p50)} on the ${wingLabel} wing, the bar is under ${REPLAY_TARGETS.followUpP50Ms} ms`,
            run.file
          );
        const ws = turns
          .filter(atRestTurn)
          .map((t) => countProseWords(t.served));
        const med = pctl(ws, 0.5);
        if (med === null || med > REPLAY_TARGETS.wordsAtRestMedian)
          flipFail(
            `${flag}: median words at rest ${num(med)} on the ${wingLabel} wing, the bar is ${REPLAY_TARGETS.wordsAtRestMedian} or fewer`,
            run.file
          );
        flips.push(
          `    ${wingLabel}: ${run.file}, ${plural(turns.length, "turn")}, route p50 ${ms(p50)}, median words at rest ${num(med)}`
        );
      } else if (flag === "COACH_FOLLOWUP_PROMPT=fielded") {
        if (turns.length < REPLAY_TARGETS.minTurnsPerWing)
          flipFail(
            `${flag}: ${plural(turns.length, "target turn")} on the ${wingLabel} wing, the bar reads at least ${REPLAY_TARGETS.minTurnsPerWing}`,
            run.file
          );
        let fieldedTurns = 0;
        for (const t of turns) {
          if (t.status !== 200 || t.fielded?.served !== "fielded") continue;
          fieldedTurns += 1;
          const rd = readings.find((r) => r.run === run && r.turn === t);
          for (const m of rd?.moves ?? [])
            if (m.cls === "illegal" || m.cls === "past" || m.cls === "offLine")
              flipFail(
                `${flag}: ${m.mention} is ${CLASS_WORDS[m.cls]} in a fielded answer`,
                run.file,
                t.id
              );
          for (const f of evalFigures(t.served))
            flipFail(
              `${flag}: eval figure ${f} in a fielded answer's prose`,
              run.file,
              t.id
            );
          const fx = input.fixtures.get(t.fixture);
          if (fx)
            for (const p of proofTokens(
              t.served,
              fx.moveHistory,
              fx.gameEval.positions
            ).onLine)
              if (!p.drawable)
                flipFail(`${flag}: ${p.token} cannot be drawn`, run.file, t.id);
        }
        flips.push(
          `    ${wingLabel}: ${run.file}, ${plural(turns.length, "turn")}, ${fieldedTurns} served fielded`
        );
      } else {
        const missing = (input.intent60?.rows ?? [])
          .filter((r) => r.expect.grammar !== "one_move")
          .filter((r) => !turns.some((t) => t.kind === `intent-60:${r.id}`));
        for (const r of missing)
          flipFail(
            `${flag}: intent-60 row #${r.id} is missing on the ${wingLabel} wing`,
            run.file
          );
        for (const t of turns)
          if (!t.echo.routing)
            flipFail(
              `${flag}: the turn carries no routing echo`,
              run.file,
              t.id
            );
        flips.push(
          `    ${wingLabel}: ${run.file}, ${plural(turns.length, "turn")}`
        );
      }
    }
  });
  sections.push(flips);

  // ── Phase 3 exit ──
  const exit: string[] = [];
  const perWing: string[] = [];
  const invented = { illegal: 0, past: 0, offLine: 0, figures: 0, runs: 0 };
  for (const wing of [false, true]) {
    const run = newestAtTarget("followup-fielded", wing);
    if (!run) continue;
    const turns = run.results.turns.filter((t) => atTarget(configFor(t), wing));
    const xs = turns
      .filter((t) => t.timing && t.servedBy !== "page")
      .map((t) => t.timing!.elapsedMs);
    const ws = turns.filter(atRestTurn).map((t) => countProseWords(t.served));
    perWing.push(
      `validators ${wing ? "on" : "off"} p50 ${ms(pctl(xs, 0.5))} and median ${num(pctl(ws, 0.5))} words over ${plural(turns.length, "turn")}`
    );
    invented.runs += 1;
    for (const t of turns) {
      const rd = readings.find((r) => r.run === run && r.turn === t);
      for (const m of rd?.moves ?? []) {
        if (m.cls === "illegal") invented.illegal += 1;
        if (m.cls === "past") invented.past += 1;
        if (m.cls === "offLine") invented.offLine += 1;
      }
      if (answered(t)) invented.figures += evalFigures(t.served).length;
    }
  }
  exit.push(
    `  latency and words at the target (${targetLabel}): ${
      perWing.length
        ? perWing.join(", ")
        : "no run at the target configuration yet"
    }`
  );
  exit.push(
    `  invented moves and figures in prose: ${
      invented.runs
        ? `target run ${invented.illegal} illegal, ${invented.past} past, ${invented.offLine} off the line, ${invented.figures} figures`
        : "no run at the target configuration yet"
    }${
      storyRefereed
        ? `, story probe after HEAD's referee ${storyRefereed.illegal} illegal, ${storyRefereed.past} past, ${storyRefereed.offLine} off the line, ${storyRefereed.figures} figures`
        : ""
    }`
  );
  exit.push(
    `  UI questions by rule: intent-60 ${uiRuled} of ${uiTotal}, no routing call (route.router.test.ts)`
  );
  exit.push(
    typedMax === null
      ? "  routing calls per typed turn: no recorded router turn yet"
      : `  routing calls per typed turn: recorded max ${typedMax}`
  );
  exit.push(
    "  Flag-off byte-identical: held by route.golden.test.ts in the merge gate"
  );

  return {
    failures,
    acknowledged,
    fixedSinceHead,
    sections,
    exit,
    latency,
    details,
  };
}

interface Group {
  file: string;
  label: string;
  rows: TurnReading[];
}

/** Turns grouped by file and configuration, in the order they were read. */
function groupReadings(readings: readonly TurnReading[]): Group[] {
  const out: Group[] = [];
  for (const r of readings) {
    const label = `${r.run.file} [${configLabel(r.config)}]`;
    let g = out.find((x) => x.label === label);
    if (!g) {
      g = { file: r.run.file, label, rows: [] };
      out.push(g);
    }
    g.rows.push(r);
  }
  return out;
}

export function renderReport(
  r: GateReport,
  opts: { verbose?: boolean } = {}
): string {
  const line = (f: GateFailure) =>
    `${f.check}${f.file ? ` ${f.file}` : ""}${f.turn ? ` ${f.turn}` : ""}: ${f.detail}`;
  const out: string[] = [
    "Replay gate (pathway 3.7): committed results, no network, no key",
    "",
  ];
  for (const s of r.sections) out.push(...s, "");
  out.push("== Phase 3 exit", ...r.exit, "");
  if (opts.verbose && r.details.length)
    out.push("== Details", ...r.details.map((d) => `  ${d}`), "");
  for (const f of r.fixedSinceHead) out.push(`FIXED SINCE HEAD ${line(f)}`);
  for (const f of r.acknowledged) out.push(`ACKNOWLEDGED ${line(f)}`);
  for (const f of r.failures) out.push(`FAIL ${line(f)}`);
  out.push(
    r.failures.length
      ? `Verdict: FAIL (${r.failures.length} failures)`
      : `Verdict: PASS (${r.acknowledged.length} acknowledged, ${r.fixedSinceHead.length} fixed since HEAD)`
  );
  return `${out.join("\n")}\n`;
}

/**
 * Where do real follow-up questions land in the shadow intent router? $0.
 *
 * Routes every question the repo has saved (the synthetic tester's run
 * CSVs, the follow-up story probe) plus any file of one-question-per-line
 * passed with --questions, and prints the intent distribution, the share a
 * rule decided, and every question a rule left for the classifier. The
 * tester's live category sweep is the measurement the pathway names; this
 * is the offline half that costs nothing and runs anywhere.
 *
 * With --live (pathway 3.4) the same questions also go through the live
 * rules (lib/coach/intentRules.ts, the ones COACH_INTENT_ROUTER acts on),
 * and their distribution is printed beside the shadow's, with the share
 * left to the router.
 *
 * Usage: npx tsx scripts/eval/intent_router_replay.ts [--questions q.txt] [--show-unknown] [--live]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Chess } from "chess.js";

const argv = process.argv.slice(2);
const SHOW_UNKNOWN = argv.includes("--show-unknown");
const LIVE = argv.includes("--live");
const EXTRA = (() => {
  const i = argv.indexOf("--questions");
  return i >= 0 ? argv[i + 1] : null;
})();
const REPO = process.cwd();

interface Sample {
  source: string;
  question: string;
  moves: string[];
  playerColor: "w" | "b";
}

/** A minimal CSV reader: quoted fields, doubled quotes, newlines inside quotes. */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * The tester's games, numbered the way run.ts numbers them: the .pgn files
 * of scripts/synthetic-tester/games in sorted order, those chess.js can
 * load, id = position in that list. A run row's `game_id` is that id and
 * its `white` header confirms the match.
 */
function loadTesterGames(): Array<{
  id: number;
  white: string;
  moves: string[];
}> {
  const dir = path.join(REPO, "scripts/synthetic-tester/games");
  if (!fs.existsSync(dir)) return [];
  const out: Array<{ id: number; white: string; moves: string[] }> = [];
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".pgn"))
    .sort()) {
    const g = new Chess();
    try {
      g.loadPgn(fs.readFileSync(path.join(dir, file), "utf8"), {
        strict: false,
      });
    } catch {
      continue;
    }
    out.push({
      id: out.length,
      white: g.header().White ?? "",
      moves: g.history(),
    });
  }
  return out;
}

function loadSamples(): Sample[] {
  const samples: Sample[] = [];
  const games = loadTesterGames();
  const runsDir = path.join(REPO, "scripts/synthetic-tester/runs");
  if (fs.existsSync(runsDir)) {
    for (const file of fs
      .readdirSync(runsDir)
      .filter((f) => f.endsWith(".csv"))) {
      const rows = readCsv(fs.readFileSync(path.join(runsDir, file), "utf8"));
      const header = rows[0] ?? [];
      const qi = header.indexOf("student_question");
      const gi = header.indexOf("game_id");
      const wi = header.indexOf("white");
      if (qi < 0) continue;
      for (const row of rows.slice(1)) {
        const q = (row[qi] ?? "").trim();
        if (!q) continue;
        // The full game the question was asked in, as the route's context carries it.
        const id = gi >= 0 ? Number(row[gi]) : NaN;
        const game = games.find(
          (g) => g.id === id && (wi < 0 || !row[wi] || g.white === row[wi])
        );
        samples.push({
          source: `runs/${file}`,
          question: q,
          moves: game?.moves ?? [],
          playerColor: "w",
        });
      }
    }
  }
  const probe = path.join(
    REPO,
    "scripts/eval/results/followup-story-probe.json"
  );
  if (fs.existsSync(probe)) {
    const saved = JSON.parse(fs.readFileSync(probe, "utf8"));
    for (const row of saved.results) {
      const fx = JSON.parse(
        fs.readFileSync(
          path.join(
            REPO,
            `src/lib/contract/__tests__/fixtures-real/${row.fixture}.json`
          ),
          "utf8"
        )
      );
      samples.push({
        source: "followup-story-probe",
        question: row.question,
        moves: fx.moveHistory,
        playerColor: fx.playerColor === "b" ? "b" : "w",
      });
    }
  }
  if (EXTRA) {
    for (const line of fs.readFileSync(EXTRA, "utf8").split("\n")) {
      const q = line.trim();
      if (q)
        samples.push({
          source: path.basename(EXTRA),
          question: q,
          moves: [],
          playerColor: "w",
        });
    }
  }
  return samples;
}

(async () => {
  const { resolveQuestionAnchor } = await import("@/lib/coach/questionAnchor");
  const { resolveQuestionIntent, QUESTION_INTENTS } = await import(
    "@/lib/coach/questionIntent"
  );

  const samples = loadSamples();
  const byIntent: Record<string, number> = {};
  const byRule: Record<string, number> = {};
  const unknown: Sample[] = [];
  let ruled = 0;
  for (const s of samples) {
    const anchor = resolveQuestionAnchor(s.question, s.moves, s.playerColor);
    const r = resolveQuestionIntent(s.question, {
      anchor,
      moves: s.moves,
      playerColor: s.playerColor,
    });
    byIntent[r.intent] = (byIntent[r.intent] ?? 0) + 1;
    byRule[r.rule] = (byRule[r.rule] ?? 0) + 1;
    if (r.rule !== "none") ruled += 1;
    else unknown.push(s);
  }
  const pct = (n: number) =>
    `${((100 * n) / Math.max(1, samples.length)).toFixed(0)}%`;
  console.log(
    `${samples.length} questions from ${Array.from(new Set(samples.map((s) => s.source))).join(", ")}`
  );
  console.log(
    `a rule decided ${ruled} (${pct(ruled)}); the classifier keeps ${samples.length - ruled} (${pct(samples.length - ruled)})\n`
  );
  console.log("intent          count");
  for (const intent of QUESTION_INTENTS) {
    const n = byIntent[intent] ?? 0;
    if (n > 0)
      console.log(`  ${intent.padEnd(14)} ${String(n).padStart(4)}  ${pct(n)}`);
  }
  console.log("\nrules:");
  for (const [rule, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1]))
    console.log(`  ${rule.padEnd(24)} ${n}`);
  if (SHOW_UNKNOWN) {
    console.log("\nleft for the classifier:");
    for (const s of unknown)
      console.log(`  [${s.source}] ${s.question.slice(0, 120)}`);
  }
  if (!LIVE) return;

  // The live rules on the same questions, beside the shadow's reading.
  const { resolveLiveIntent } = await import("@/lib/coach/intentRules");
  const liveByIntent: Record<string, number> = {};
  const liveByRule: Record<string, number> = {};
  const toRouter: Sample[] = [];
  let liveRuled = 0;
  let vetoed = 0;
  for (const s of samples) {
    const anchor = resolveQuestionAnchor(s.question, s.moves, s.playerColor);
    const r = resolveLiveIntent(s.question, {
      anchor,
      moves: s.moves,
      playerColor: s.playerColor,
    });
    liveByIntent[r.intent] = (liveByIntent[r.intent] ?? 0) + 1;
    liveByRule[r.rule] = (liveByRule[r.rule] ?? 0) + 1;
    if (r.veto) vetoed += 1;
    if (r.source === "rule") liveRuled += 1;
    else toRouter.push(s);
  }
  console.log(
    `\nlive rules: a rule decided ${liveRuled} (${pct(liveRuled)}); the router is asked ${toRouter.length} (${pct(toRouter.length)}), ${vetoed} of them a concept set aside beside a board word\n`
  );
  console.log("intent          shadow  live");
  for (const intent of QUESTION_INTENTS) {
    const a = byIntent[intent] ?? 0;
    const b = liveByIntent[intent] ?? 0;
    if (a > 0 || b > 0)
      console.log(
        `  ${intent.padEnd(14)} ${String(a).padStart(4)}  ${String(b).padStart(4)}`
      );
  }
  console.log("\nlive rules:");
  for (const [rule, n] of Object.entries(liveByRule).sort(
    (a, b) => b[1] - a[1]
  ))
    console.log(`  ${rule.padEnd(24)} ${n}`);
  if (SHOW_UNKNOWN) {
    console.log("\nleft for the router:");
    for (const s of toRouter)
      console.log(`  [${s.source}] ${s.question.slice(0, 120)}`);
  }
})();

/**
 * Replay the moment checks over saved coach answers. $0, no network.
 *
 * Two corpora, both already committed:
 *   - the eight real fast-tier follow-up answers followup_story_probe.ts
 *     saved (two fixtures, two questions, with and without line stories),
 *     lifted into fields by momentFromFollowUpText;
 *   - the thirty shipped reviews of the CI-5 gate run (ten fixtures, three
 *     samples each), each key-moment card's [WHY] body lifted by
 *     momentFromCardBody.
 *
 * Each moment is checked against the facts the compact contract holds for
 * its move (lib/coach/momentChecks.ts) and the script prints, per corpus,
 * how many moments would lose a field, which fields, and which checks
 * fire, with the computed result each failure carries. The per-field
 * rates are the measurement the fielded follow-up (Phase 3 of the ideal
 * pathway) and the referee-retirement PRs need before any check arms.
 *
 * Usage: npx tsx scripts/eval/moment_checks_replay.ts [--verbose] [--output p.json]
 */
import * as fs from "node:fs";
import * as path from "node:path";
process.env.LC0_API_URL = "";
process.env.MAIA_API_URL = "";

const argv = process.argv.slice(2);
const VERBOSE = argv.includes("--verbose");
const OUT = (() => {
  const i = argv.indexOf("--output");
  return i >= 0 ? argv[i + 1] : null;
})();
const REPO = process.cwd();
/** The follow-up probe ran on the real-Stockfish fixtures; the CI-5 gate run on the hand-authored ones. Each corpus is replayed against the contract it was generated from. */
const FIXTURES_REAL = path.join(
  REPO,
  "src/lib/contract/__tests__/fixtures-real"
);
const FIXTURES_SYNTH = path.join(REPO, "src/lib/contract/__tests__/fixtures");
const PROBE = path.join(REPO, "scripts/eval/results/followup-story-probe.json");
const GATES = path.join(
  REPO,
  "scripts/eval/results/contract-ci5-gates-2026-08-11.json"
);

const FIELDS = ["idea", "happens", "proof", "lesson", "question"] as const;
type Field = (typeof FIELDS)[number];

interface Tally {
  moments: number;
  /** Moments with at least one fact failure on the field (the field would be omitted). */
  omittedBy: Record<Field, number>;
  /** Moments with at least one shape failure on the field (regenerate, then serve). */
  reshapedBy: Record<Field, number>;
  /** Fires per check name. */
  byCheck: Record<string, number>;
  /** Moments with no failure of any kind. */
  clean: number;
  /** Moments whose prose named a field at all (the denominator for optional fields). */
  present: Record<Field, number>;
  examples: Record<string, string[]>;
  unmatched: number;
}

const zero = (): Record<Field, number> => ({
  idea: 0,
  happens: 0,
  proof: 0,
  lesson: 0,
  question: 0,
});
const tally = (): Tally => ({
  moments: 0,
  omittedBy: zero(),
  reshapedBy: zero(),
  byCheck: {},
  clean: 0,
  present: zero(),
  examples: {},
  unmatched: 0,
});
const pct = (a: number, b: number) =>
  `${((100 * a) / Math.max(1, b)).toFixed(0)}%`;

(async () => {
  const { buildCoachContract } = await import("@/lib/contract/builder");
  const { toCompactContract } = await import("@/lib/contract/followUp");
  const { selectCardInsights } = await import("@/lib/prompts/verbalizerPrompt");
  const { getFenAtHalfMove } = await import("@/lib/contract/chessFormat");
  const { parseInsightHeader } = await import("@/lib/contract/insightGrammar");
  const { __setFetchForTesting } = await import("@/lib/grounding/chessdb");
  const { momentFromCardBody, momentFromFollowUpText } = await import(
    "@/lib/coach/moment"
  );
  const { checkMoment, factsFromCompactInsight } = await import(
    "@/lib/coach/momentChecks"
  );
  type CompactContract = import("@/lib/contract/followUp").CompactContract;
  type MomentProse = import("@/lib/coach/moment").MomentProse;
  type MomentCheckFailure =
    import("@/lib/coach/momentChecks").MomentCheckFailure;
  __setFetchForTesting((() => Promise.reject(new Error("offline"))) as never);

  const compacts = new Map<
    string,
    { compact: CompactContract; moves: string[] }
  >();
  async function compactFor(dir: string, fixture: string) {
    const key = `${dir}/${fixture}`;
    const hit = compacts.get(key);
    if (hit) return hit;
    const fx = JSON.parse(
      fs.readFileSync(path.join(dir, `${fixture}.json`), "utf8")
    );
    const contract = await buildCoachContract({
      moveHistory: fx.moveHistory,
      gameEval: fx.gameEval,
      playerColor: fx.playerColor,
      username: fx.username,
      userRating: fx.userRating,
      gameHeaders: fx.gameHeaders,
      identity: {
        fen: getFenAtHalfMove(fx.moveHistory, fx.moveHistory.length),
        playerColor: fx.playerColor || "w",
      },
    });
    const entry = {
      compact: toCompactContract(
        contract,
        selectCardInsights(contract).map((i) => i.factIdPrefix)
      ),
      moves: fx.moveHistory as string[],
    };
    compacts.set(key, entry);
    return entry;
  }

  function record(
    t: Tally,
    label: string,
    prose: MomentProse,
    failures: MomentCheckFailure[]
  ) {
    t.moments += 1;
    for (const f of FIELDS) if (prose[f] !== null) t.present[f] += 1;
    if (failures.length === 0) t.clean += 1;
    const omitted = new Set<Field>();
    const reshaped = new Set<Field>();
    for (const f of failures) {
      t.byCheck[f.check] = (t.byCheck[f.check] ?? 0) + 1;
      (f.kind === "fact" ? omitted : reshaped).add(f.field);
      const ex = (t.examples[f.check] ??= []);
      if (ex.length < 3) ex.push(`${label}: ${f.detail}`);
      if (VERBOSE)
        console.log(
          `    ${f.kind === "fact" ? "✂" : "~"} ${f.field}/${f.check}: ${f.detail}`
        );
    }
    omitted.forEach((f) => (t.omittedBy[f] += 1));
    reshaped.forEach((f) => (t.reshapedBy[f] += 1));
  }

  function print(name: string, t: Tally) {
    console.log(
      `\n== ${name}: ${t.moments} moments, ${t.clean} clean (${pct(t.clean, t.moments)})${t.unmatched ? `, ${t.unmatched} unmatched` : ""}`
    );
    console.log("   field      present   omitted (fact)   reshaped (shape)");
    for (const f of FIELDS) {
      console.log(
        `   ${f.padEnd(10)} ${String(t.present[f]).padStart(7)}   ${String(t.omittedBy[f]).padStart(3)} (${pct(t.omittedBy[f], t.present[f]).padStart(4)})     ${String(t.reshapedBy[f]).padStart(3)} (${pct(t.reshapedBy[f], t.present[f]).padStart(4)})`
      );
    }
    const checks = Object.entries(t.byCheck).sort((a, b) => b[1] - a[1]);
    console.log(
      `   checks: ${checks.map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`
    );
    for (const [check, examples] of Object.entries(t.examples)) {
      console.log(`   ${check}:`);
      for (const e of examples) console.log(`     ${e}`);
    }
  }

  // ── Corpus A: the saved follow-up answers ────────────────────────────────
  const followUps = tally();
  const probe = JSON.parse(fs.readFileSync(PROBE, "utf8"));
  for (const row of probe.results) {
    const { compact, moves } = await compactFor(FIXTURES_REAL, row.fixture);
    // The move the question names: "8. Nc7+" / "18... Bxe6", else "move 8" read as the player's move.
    const numbered = /(\d+)\.(\.\.)?\s*([A-Za-z0-9+#=-]+)/.exec(row.question);
    const spoken = /\bmove\s+(\d+)\b/i.exec(row.question);
    const moveNumber = numbered
      ? Number(numbered[1])
      : spoken
        ? Number(spoken[1])
        : null;
    const color = numbered
      ? numbered[2]
        ? "b"
        : "w"
      : compact.playerColor === "b"
        ? "b"
        : "w";
    const insight =
      compact.insights.find(
        (i) => i.moveNumber === moveNumber && i.color === color
      ) ?? compact.insights[0];
    if (!insight) {
      followUps.unmatched += 2;
      continue;
    }
    const facts = factsFromCompactInsight(insight, compact, moves);
    for (const arm of ["without", "with"] as const) {
      const label = `${row.fixture} ${arm}`;
      const prose = momentFromFollowUpText(row[arm].answer);
      if (VERBOSE) console.log(`\n-- ${label} | Q: ${row.question}`);
      const failures = checkMoment(
        {
          idea: prose.idea ?? "",
          happens: prose.happens ?? "",
          proof: prose.proof,
          lesson: prose.lesson,
          question: prose.question,
        },
        facts
      );
      record(followUps, label, prose, failures);
    }
  }
  print("follow-up answers (followup-story-probe.json)", followUps);

  // ── Corpus B: the shipped gate reviews, card by card ─────────────────────
  const cards = tally();
  const gates = JSON.parse(fs.readFileSync(GATES, "utf8"));
  const BLOCK_RE = /\[INSIGHT:([^\]]*)\]([\s\S]*?)\[\/INSIGHT\]/g;
  const WHY_RE = /\[WHY\]([\s\S]*?)\[\/WHY\]/;
  for (const sample of gates.samples) {
    if (typeof sample.shipped !== "string") continue;
    const { compact, moves } = await compactFor(FIXTURES_SYNTH, sample.fixture);
    for (const block of Array.from(
      sample.shipped.matchAll(BLOCK_RE)
    ) as RegExpMatchArray[]) {
      const header = parseInsightHeader(block[1]);
      const why = WHY_RE.exec(block[2]);
      if (!header || !why) {
        cards.unmatched += 1;
        continue;
      }
      const insight = compact.insights.find(
        (i) => i.moveNumber === header.moveNumber && i.color === header.color
      );
      if (!insight) {
        cards.unmatched += 1;
        continue;
      }
      const label = `${sample.fixture}#${sample.sample} ${header.moveNumber}${header.color === "b" ? "..." : "."}${header.playedMove}`;
      const prose = momentFromCardBody(why[1]);
      if (VERBOSE) console.log(`\n-- ${label}`);
      const failures = checkMoment(
        {
          idea: prose.idea ?? "",
          happens: prose.happens ?? "",
          proof: prose.proof,
          lesson: prose.lesson,
          question: prose.question,
        },
        factsFromCompactInsight(insight, compact, moves)
      );
      record(cards, label, prose, failures);
    }
  }
  print("key-moment cards (contract-ci5-gates-2026-08-11.json)", cards);

  if (OUT) {
    fs.writeFileSync(
      OUT,
      JSON.stringify(
        {
          date: new Date().toISOString().slice(0, 10),
          mode: "moment_checks_replay",
          sources: {
            followUps: {
              answers: path.relative(REPO, PROBE),
              fixtures: path.relative(REPO, FIXTURES_REAL),
            },
            cards: {
              reviews: path.relative(REPO, GATES),
              fixtures: path.relative(REPO, FIXTURES_SYNTH),
            },
          },
          followUps,
          cards,
        },
        null,
        2
      )
    );
    console.log(`\nwrote ${OUT}`);
  }
})();

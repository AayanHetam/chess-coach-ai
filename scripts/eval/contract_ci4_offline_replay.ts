/** Offline ladder replay over the COMMITTED verify texts — no network. */
import * as fs from "node:fs";
import * as path from "node:path";
import type { CoachContract, InsightContract } from "@/lib/contract/types";

const REPO_ROOT = process.cwd();
const FIXTURES_DIR = path.join(REPO_ROOT, "src/lib/contract/__tests__/fixtures");
const SRC = process.argv[2] ?? "scripts/eval/results/contract-ci4-verify-2026-08-10.json";

async function buildContractFor(name: string, f: any): Promise<CoachContract> {
  const { buildCoachContract } = await import("@/lib/contract/builder");
  const { getFenAtHalfMove } = await import("@/lib/contract/chessFormat");
  const requestFen = getFenAtHalfMove(f.moveHistory, f.moveHistory.length);
  return buildCoachContract({
    moveHistory: f.moveHistory,
    gameEval: f.gameEval,
    playerColor: f.playerColor,
    username: f.username,
    userRating: f.userRating,
    gameHeaders: f.gameHeaders,
    uid: `diag-${name}`,
    identity: { fen: requestFen, playerColor: f.playerColor || "w" },
  });
}

function parseInsightBlocks(raw: string) {
  const blocks: Array<{ moveNumber: number; color: string; prose: string; body: string }> = [];
  for (const m of Array.from(raw.matchAll(/\[INSIGHT:([^\]]*)\]([\s\S]*?)\[\/INSIGHT\]/g))) {
    const fields = m[1].split(":").map((s) => s.trim());
    blocks.push({
      moveNumber: Number.parseInt(fields[0] ?? "", 10),
      color: (fields[1] ?? "").toLowerCase(),
      prose: m[0],
      body: m[2],
    });
  }
  return blocks;
}

/** A "stub" = a surviving prose line that is a dangling fragment. */
function stubLines(body: string): string[] {
  const out: string[] = [];
  for (const raw of body.split("\n")) {
    const t = raw.trim();
    if (!t || /^\[/.test(t)) continue;
    const bare = t.replace(/^[-*]\s*/, "");
    // fragment heuristics: ends on a move number, or is a bare label,
    // or is a very short non-sentence remnant.
    if (/\b\d{1,3}\.(\.\.)?$/.test(bare)) out.push(t);
    else if (/^(Idea|Problem|Solution|Outcome|Key idea|Takeaway)\s*:\s*$/i.test(bare)) out.push(t);
    else if (bare.replace(/[^A-Za-z]/g, "").length < 12) out.push(t);
  }
  return out;
}

/** Empty structural sections left behind ([THREATS]\n[/THREATS]). */
function emptySections(body: string): string[] {
  const out: string[] = [];
  const re = /\[(WHY|THREATS|ROLES)\]([\s\S]*?)\[\/\1\]/g;
  for (const m of Array.from(body.matchAll(re))) {
    const inner = m[2]
      .split("\n")
      .filter((l) => l.trim() && !/^\s*\[/.test(l))
      .join("");
    if (!inner.trim()) out.push(m[1]);
  }
  return out;
}

async function main() {
  delete process.env.LC0_API_URL;
  delete process.env.MAIA_API_URL;
  const chessdb = await import("@/lib/grounding/chessdb");
  chessdb.__setFetchForTesting(async () => {
    throw new Error("network disabled");
  });
  const { runInsightLadder } = await import("@/lib/contract/ladder");
  const { CI5_CANDIDATE_ARMING_TABLE } = await import("./ci4GateTable");
  const table = process.env.ARM === "0" ? undefined : CI5_CANDIDATE_ARMING_TABLE;
  const { aggregateFidelity } = await import("@/lib/contract/refereeChecks");
  const { stripGrammarTokenLines, stripCitations } = await import("@/lib/contract/citations");

  const j = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, SRC), "utf8"));

  const ladderDist: Record<string, number> = {};
  const findingCats: Record<string, number> = {};
  let cards = 0;
  let stubs = 0;
  let emptySecs = 0;
  const coverages: number[] = [];
  const perGameCoverage: number[] = [];
  let retNum = 0;
  let retDen = 0;
  let charKept = 0;
  let charRaw = 0;
  const fidEntries: Array<{ insight: InsightContract; prose: string; contract: CoachContract }> = [];
  const shippedByGame: Array<{ fixture: string; text: string }> = [];

  for (const g of j.perGame) {
    const fixtureFile = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${g.fixture}.json`), "utf8"));
    const contract = await buildContractFor(g.fixture, fixtureFile);
    const gameCov: number[] = [];
    let shippedText = "";
    for (const block of parseInsightBlocks(g.texts.rawPreLadder)) {
      const insight = contract.insights.find(
        (i) => i.moveNumber === block.moveNumber && i.color === block.color,
      );
      if (!insight) continue;
      const res = await runInsightLadder(block.body, {
        insight,
        contract,
        refereeOpts: { correlationId: `diag-${g.fixture}`, userRating: fixtureFile.userRating ?? 1500 },
        refereeMode: "deterministic",
        citationGranularity: "sentence",
        // deadline in the past → LLM stages skipped (drop or template only)
        deadlineAtMs: Date.now() - 1,
        budgets: { editsRemaining: 0, regensRemaining: 0, relationalRemaining: 0 },
        regenSystem: { stable: "", perUser: "" },
      }, table);
      cards++;
      ladderDist[res.stage] = (ladderDist[res.stage] ?? 0) + 1;
      for (const f of res.findings) findingCats[f.category] = (findingCats[f.category] ?? 0) + 1;
      coverages.push(res.citationCoverage);
      gameCov.push(res.citationCoverage);
      const shippedBody = res.finalText.replace(/^\[INSIGHT:[^\]]*\]\n?/, "").replace(/\[\/INSIGHT\]$/, "");
      stubs += stubLines(shippedBody).length;
      emptySecs += emptySections(shippedBody).length;
      const rawProse = stripGrammarTokenLines(stripCitations(block.body)).replace(/\s+/g, " ").trim();
      const shipProse = stripGrammarTokenLines(shippedBody).replace(/\s+/g, " ").trim();
      charRaw += rawProse.length;
      charKept += shipProse.length;
      retNum++;
      retDen++;
      fidEntries.push({ insight, prose: res.finalText, contract });
      shippedText += res.finalText + "\n\n";
    }
    if (gameCov.length) perGameCoverage.push(gameCov.reduce((a, b) => a + b, 0) / gameCov.length);
    shippedByGame.push({ fixture: g.fixture, text: shippedText });
  }

  // Fabrication must be aggregated PER CONTRACT (runInsightChecks consults the
  // contract-global eval-display license pool).
  let fabCount = 0;
  let fabClaims = 0;
  const fabCats: Record<string, number> = {};
  const byContract = new Map<CoachContract, typeof fidEntries>();
  for (const e of fidEntries) {
    const arr = byContract.get(e.contract) ?? [];
    arr.push(e);
    byContract.set(e.contract, arr);
  }
  for (const [c, entries] of Array.from(byContract.entries())) {
    const r = aggregateFidelity(
      entries.map((e: (typeof fidEntries)[number]) => ({ insight: e.insight, prose: stripGrammarTokenLines(e.prose) })),
      c,
    );
    fabCount += r.fabricationCount;
    fabClaims += r.claimSentences;
    for (const v of r.allViolations) fabCats[v.category] = (fabCats[v.category] ?? 0) + 1;
  }
  const report = {
    fabricationRate: fabClaims > 0 ? (fabCount / fabClaims) * 100 : 0,
    fabricationCount: fabCount,
    claimSentences: fabClaims,
  };
  console.log(`cards=${cards} ladder=${JSON.stringify(ladderDist)}`);
  console.log(`findingCategories=${JSON.stringify(findingCats)}`);
  console.log(
    `citationCoverage mean-of-card=${(coverages.reduce((a, b) => a + b, 0) / coverages.length).toFixed(3)} ` +
      `mean-of-game=${(perGameCoverage.reduce((a, b) => a + b, 0) / perGameCoverage.length).toFixed(3)}`,
  );
  console.log(`prose char retention=${(charKept / charRaw).toFixed(3)}`);
  console.log(`dangling stubs=${stubs}  empty sections=${emptySecs}`);
  console.log(
    `shipped fabrication (stripped footprint)=${report.fabricationRate.toFixed(2)}/100 (${report.fabricationCount}/${report.claimSentences})`,
  );
  console.log(`shipped fabrication categories=${JSON.stringify(fabCats)}`);
  if (process.env.DUMP) {
    const g = shippedByGame.find((x) => x.fixture.startsWith(process.env.DUMP!));
    if (g) console.log("\n" + g.text);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

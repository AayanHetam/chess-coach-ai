/**
 * The key-less replay gate (pathway 3.7), $0, no network.
 *
 * Reads the committed follow-up results (scripts/eval/results/*.json that
 * carry the results marker, plus any --extra file) and the three frozen
 * files pinned in scripts/eval/replay/manifest.ts, and replays them with
 * HEAD's own oracle, referee and rules: move legality, referee drops, words
 * at rest, proof tokens, recorded latencies against the targets and the
 * rules' coverage of the sixty questions. The provider keys and every
 * recorded flag are deleted, fetch is trapped and chessdb is stubbed first.
 * A measurement never fails it. A P0 in served text, a changed frozen
 * corpus or a missed bar for a flipped flag does.
 *
 * Usage: npx tsx scripts/eval/replay_gate.ts [--extra file]... [--verbose]
 * Exit 0 on pass, 1 on any failure, 2 on an unknown argument.
 */
process.env.LOG_LEVEL ??= "error";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;
process.env.LC0_API_URL = "";
process.env.MAIA_API_URL = "";

(async () => {
  const argv = process.argv.slice(2);
  const extra: string[] = [];
  let verbose = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--verbose") verbose = true;
    else if (a === "--extra" && argv[i + 1] !== undefined)
      extra.push(argv[++i]);
    else {
      console.error(
        `unknown argument ${a}. Usage: npx tsx scripts/eval/replay_gate.ts [--extra file]... [--verbose]`
      );
      process.exit(2);
    }
  }

  const { RECORDED_FLAGS } = await import("./lib/followUpRecord");
  for (const f of RECORDED_FLAGS) delete process.env[f];

  const { installOfflineGuards, loadGateInput, runGate, renderReport } =
    await import("./replay/gate");
  const guard = installOfflineGuards();
  const input = await loadGateInput({ repoRoot: process.cwd(), extra });
  const report = await runGate(input);
  for (const host of guard.attempts)
    report.failures.push({ check: "network", detail: host });
  guard.restore();
  process.stdout.write(renderReport(report, { verbose }));
  process.exit(report.failures.length ? 1 : 0);
})();

#!/usr/bin/env python3
"""
Mutation-test every fix made in response to the adversarial audit.

For each fix: break it, run the suite, and require the suite to go RED. A fix
whose removal leaves the tests green is not covered — the test passes for some
other reason, which has already happened twice in this module.
"""
import subprocess, shutil, sys, os

# Repo root — the script lives at scripts/intent/mutate.py.
WT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
IF = os.path.join(WT, "src/lib/intent/intentFacts.ts")
PF = os.path.join(WT, "src/lib/intent/positionFacts.ts")
FG = os.path.join(WT, "src/lib/intent/fromGameEval.ts")
TESTS = [
    "src/lib/intent/__tests__/intentFacts.test.ts",
    "src/lib/intent/__tests__/purposeRanking.test.ts",
    "src/lib/intent/__tests__/positionFacts.test.ts",
    "src/lib/intent/__tests__/invariants.test.ts",
    "src/lib/intent/__tests__/fromGameEval.test.ts",
]

# (label, file, find, replace) — each disables exactly one fix.
MUTATIONS = [
    ("mate: only the root line is consulted again", IF,
     "  const inMoves = a === null ? b! : b === null ? a : Math.min(a, b);",
     "  const inMoves = a === null ? 0 : a;"),

    ("mate: only the produced position is consulted again", IF,
     "  if (a === null && b === null) return null;",
     "  if (b === null) return null;"),

    ("opponent reply scored from the position it PRODUCED again", FG,
     """      const actualScore = replyInSameSearch
        ? toScore(replyInSameSearch)
        : isTimedOut(afterNext?.lines)
          ? null
          : toScore(afterNext!.lines[0]);""",
     """      const actualScore = isTimedOut(afterNext?.lines) ? null : toScore(afterNext!.lines[0]);"""),

    ("cost: reads the played move's score from the OTHER search again", IF,
     "  const played = playedScoreOf(probe);",
     "  const played = probe.playedScore;"),

    ("free tempo: valued across measurement regimes again", IF,
     "    const rootScore = probe.rootBestProbed ?? probe.rootLines[0]?.score;",
     "    const rootScore = probe.rootLines[0]?.score;"),

    ("cross-regime: prophylaxis falls back to the Tier 0 baseline again", IF,
     "const specific = diffCp(probe.opponentBestAfterProbed, probe.threatAfter.score);",
     "const specific = diffCp(probe.opponentBestAfterProbed ?? probe.opponentBestAfter, probe.threatAfter.score);"),

    ("LVA: enemy king becomes cheapest attacker again", PF,
     '''  const cost = (m: { piece: PieceSymbol; promotion?: string }) =>
    (m.piece === "k" ? PIECE_VALUE_CP.q + 1 : valueOf(m.piece)) - promotionBonus(m.promotion);
  captures.sort((a, b) => cost(a) - cost(b));''',
     '''  captures.sort((a, b) => {
    const av = valueOf(a.piece); const bv = valueOf(b.piece);
    if (av !== bv) return av - bv;
    return promotionBonus(b.promotion) - promotionBonus(a.promotion);
  });'''),

    ("recapture net: always unknown", PF,
     '''      recaptureNetCp:
        isRecapture && typeof opponentLastCaptureValueCp === "number"
          ? materialSwingCp - opponentLastCaptureValueCp
          : null,''',
     '''      recaptureNetCp: null,'''),

    ("prophylaxis: both stop-routes removed", IF,
     '''  if (!nowLoses && !nowInferior) {''',
     '''  if (false) {'''),

    ("prophylaxis: absolute route removed", IF,
     '''  const nowLoses = threatEndsAt <= PROPHYLAXIS_THREAT_MUST_END_BELOW_CP;''',
     '''  const nowLoses = false;'''),

    ("prophylaxis: relative route removed", IF,
     '''  const nowInferior = specific !== null && specific >= PROPHYLAXIS_MIN_SPECIFIC_CP;''',
     '''  const nowInferior = false;'''),

    ("prophylaxis: attribution gate removed", IF,
     '''  if (attribution.kind === "measured" && attribution.marginCp > PROPHYLAXIS_MAX_ATTRIBUTION_CP) {''',
     '''  if (false) {'''),

    ("quiet: board-facts requirement removed", IF,
     '''  const evidenceComplete = playedReadable && rootReadable && boardKnown && !threatLeftUnsaid;''',
     '''  const evidenceComplete = playedReadable && rootReadable && !threatLeftUnsaid;'''),

    ("quiet: unreadable played score accepted again", IF,
     '''  const playedReadable = probe.playedScore !== null && toCp(probe.playedScore) !== null;''',
     '''  const playedReadable = probe.playedScore !== null;'''),

    ("quiet: un-narrated real threat ignored", IF,
     '''  const threatLeftUnsaid = signals.threatWasReal && prophylaxis === null;''',
     '''  const threatLeftUnsaid = false;'''),

    ("trap: counterfactual fails open again", IF,
     '''  if (r.counterfactualCostCp === null || r.counterfactualCostCp === undefined) {''',
     '''  if (false) {'''),

    ("trap: walkedIntoMate skips attribution again", IF,
     '''    if (r.counterfactualCostCp >= TRAP_MIN_COST_CP) {''',
     '''    if (false) {'''),

    ("trap: unscored best reply accepted again", IF,
     '''  if (!r.best) {''',
     '''  if (false) {'''),

    ("prophylaxis: already-lost opponent counts as defused again", IF,
     """    if (isMateAgainst(probe.opponentBestAfter)) {""",
     """    if (false) {"""),

    ("cost: unmeasurably large gap reported as pawns again", IF,
     """  if (loss > DECISIVE_CP) {""",
     """  if (false) {"""),

    ("unaddressed: surviving forced mate no longer reported", IF,
     """      signals.unaddressed = unaddressed(probe, "mate-still-forced", { stillMates: true });""",
     """      signals.unaddressed = null;"""),

    ("unaddressed: barely-changed / made-it-worse threat no longer reported", IF,
     """    signals.unaddressed = swing <= -THREAT_STRENGTHENED_MIN_CP
      ? unaddressed(probe, "made-it-worse", { madeItWorse: true })
      : unaddressed(probe, "barely-changed");""",
     """    signals.unaddressed = null;"""),

    ("made-it-worse collapses back into barely-changed", IF,
     """    signals.unaddressed = swing <= -THREAT_STRENGTHENED_MIN_CP
      ? unaddressed(probe, "made-it-worse", { madeItWorse: true })
      : unaddressed(probe, "barely-changed");""",
     """    signals.unaddressed = unaddressed(probe, "barely-changed");"""),

    # The founder's catch: the label used to fire on the SIGN of a quantity that
    # moves ~25cp with measurement choices and flips with search depth.
    ("made-it-worse fires on any negative swing again (no threshold)", IF,
     """    signals.unaddressed = swing <= -THREAT_STRENGTHENED_MIN_CP""",
     """    signals.unaddressed = swing < 0"""),

    ("unaddressed: check-only illegality no longer reported", IF,
     """      signals.unaddressed = unaddressed(probe, "only-illegal-due-to-check");""",
     """      signals.unaddressed = null;"""),

    # NOT MUTATED: `unaddressedThreat: prophylaxis ? null : ...` is deliberately
    # unreachable — every site setting signals.unaddressed returns null straight
    # after — so no test can kill its removal. Listing it here would claim
    # coverage that does not exist.

    ("check guard: no longer fails closed on missing board facts", IF,
     '''    if (probe.position === null) {''',
     '''    if (false) {'''),
]


def run_tests():
    p = subprocess.run(
        [os.path.join(WT, "node_modules/.bin/vitest"), "run", *TESTS],
        cwd=WT, capture_output=True, text=True,
    )
    return p.returncode, (p.stdout + p.stderr)


def main():
    # baseline
    rc, out = run_tests()
    if rc != 0:
        print("BASELINE IS RED — fix that before mutation testing.")
        print(out[-3000:])
        sys.exit(1)
    print("baseline: GREEN\n")

    survived = []
    for label, path, find, repl in MUTATIONS:
        orig = open(path).read()
        if find not in orig:
            print(f"  ?? SKIP  {label}  (pattern not found)")
            survived.append(label + "  [PATTERN NOT FOUND]")
            continue
        shutil.copy(path, path + ".bak")
        open(path, "w").write(orig.replace(find, repl, 1))
        rc, out = run_tests()
        shutil.move(path + ".bak", path)
        if rc == 0:
            print(f"  !! SURVIVED  {label}")
            survived.append(label)
        else:
            failed = [l.strip() for l in out.splitlines() if l.strip().startswith("×")]
            print(f"  ok KILLED    {label}")
            for f in failed[:3]:
                print(f"                 caught by: {f[:95]}")
    print()
    if survived:
        print(f"{len(survived)} MUTATION(S) SURVIVED — those fixes are not covered:")
        for s in survived:
            print("   -", s)
        sys.exit(1)
    print(f"All {len(MUTATIONS)} mutations killed.")


if __name__ == "__main__":
    main()

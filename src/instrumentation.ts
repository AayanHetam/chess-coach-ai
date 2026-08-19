/**
 * Next.js instrumentation hook — runs once per worker on server boot.
 *
 * Responsibilities here:
 *   - Concept-retrieval self-test (Part C5). One canonical back-rank query is
 *     issued against the concept-first pipeline. If the top-1 result is not
 *     tagged `back-rank-mate`, we log a loud error. This catches the class of
 *     regression that motivated the whole rewrite: "the novel model is not on
 *     the hot path." If this warning appears in prod logs, the concept index
 *     is stale or the retrieval route is misconfigured.
 *
 * Self-test is best-effort: it never crashes the server. Skip it entirely if
 * Neo4j is not configured (dev without .env.local, preview deploys).
 */
export async function register() {
  // Guarded directly on NEXT_RUNTIME rather than after an early return: Next
  // statically replaces this expression per runtime, so the edge build drops
  // the import entirely. With the guard expressed as an early return instead,
  // @sentry/nextjs was still traced into edge-instrumentation.js (912 KB) and
  // pushed the og/* edge function past its 1 MB plan limit — build green,
  // deploy failed.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerSentry } = await import("./sentry.server");
    initServerSentry();
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Validate env at boot — throws on missing ANTHROPIC_API_KEY etc. so the
  // worker fails fast rather than silently 500ing on the first AI request.
  const { parseEnv, parseBoolEnv } = await import("./env");
  parseEnv();

  // parseBoolEnv (not raw === "true") so a Vercel save of "true\n" still
  // skips the self-test as intended (audit §3.8 trailing-newline class).
  if (parseBoolEnv(process.env.SKIP_RETRIEVAL_SELFTEST)) return;

  // Defer imports so instrumentation does not drag DB drivers into edge bundles
  const { getReinforcements } = await import("./lib/concept/conceptRetrieval");
  const { isNeo4jConfigured } = await import("./lib/neo4j");
  const { logger } = await import("./lib/logging");
  const log = logger.child({ module: "retrieval-selftest" });

  if (!isNeo4jConfigured()) {
    log.info("Skipping retrieval self-test: Neo4j not configured");
    return;
  }

  const CANONICAL_FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
  const CANONICAL_SOLVER = ["a1a8"]; // Ra8#

  try {
    const result = await getReinforcements({
      anchorFen: CANONICAL_FEN,
      anchorSolutionUci: CANONICAL_SOLVER,
      themes: [],
      userElo: 1500,
      limit: 3,
    });

    const detectedOk = result.anchorConcepts.includes("back-rank-mate");
    const topConcepts = result.puzzles[0]?.concepts?.map((c) => c.id) ?? [];
    const topOk = topConcepts.includes("back-rank-mate");

    if (detectedOk && topOk) {
      log.info("Retrieval self-test PASS", {
        detectedConcepts: result.anchorConcepts,
        poolSize: result.poolSize,
        top1: result.puzzles[0]?.puzzleId,
      });
    } else {
      log.error("❌ Retrieval self-test FAIL", {
        detectedConcepts: result.anchorConcepts,
        fallbackUsed: result.fallbackUsed,
        top1Concepts: topConcepts,
        poolSize: result.poolSize,
        note: "Canonical back-rank FEN did not return back-rank-mate as anchor or top-1 result. Concept pipeline may be stale or misrouted.",
      });
    }
  } catch (err) {
    logger.child({ module: "retrieval-selftest" }).error("Retrieval self-test threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

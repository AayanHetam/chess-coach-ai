/**
 * THIS is the config Next actually uses.
 *
 * `next.config.js` resolves ahead of `next.config.ts`, so while both files
 * exist this one wins and `next.config.ts` is inert. Verified, not assumed:
 * neither production nor a local `next start` emits any of the `.ts` file's
 * COEP/COOP headers. Everything in that file — those headers, the
 * `outputFileTracingIncludes` for master-tree.json, the Sentry build wrapper —
 * has therefore never taken effect.
 *
 * PR #367 deleted this file as "inert because next.config.ts wins", which is
 * backwards. That switched the app onto a config that had never run, turning
 * on site-wide `Cross-Origin-Embedder-Policy: require-corp`, which blocked
 * /scout's subresources until its 60s test timeout. The deletion was reverted
 * before merge and the headers deferred to "a separate tested PR" — this one.
 *
 * So anything expected to take effect goes HERE until someone deliberately
 * consolidates the two files behind a full test pass. Consolidation is worth
 * doing and is its own change: it activates COEP site-wide, which is a real
 * behaviour change rather than a tidy-up.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  /**
   * Data files read with `fs` at runtime, which webpack therefore never sees
   * and the tracer therefore never copies into the serverless bundle. Without
   * these the route builds clean, deploys clean, and 500s on its first request
   * in production with ENOENT.
   *
   * These entries existed in next.config.ts, the file Next does not load, so
   * they had never taken effect. See the header above.
   */
  outputFileTracingIncludes: {
    "/api/opening-explorer": ["./src/data/master-tree.json"],
    "/api/opening-theory": ["./src/data/wikibooks-theory.json"],
    // The default map plus one per rating band. Named as a glob because the
    // band is only known at request time, and a map the tracer did not copy
    // does not fail the build — it 503s on the first production request.
    "/api/repertoire": ["./src/data/repertoire-map.json", "./src/data/repertoire-map.*.json"],
    "/api/openings/search": ["./src/data/openings.json"],
    // /courses reads the repertoire map in getServerSideProps, with `fs`, to
    // rank its "answers the most" shelf against the reader's band. Same blind
    // spot as every other entry here: the tracer cannot see an fs read, and a
    // map it did not copy does not fail the build — the shelf simply loses its
    // blurbs and its ranking, in production only. Verified in
    // .next/server/pages/courses.js.nft.json, which listed ZERO of these
    // before this line existed.
    "/courses": ["./src/data/repertoire-map.json", "./src/data/repertoire-map.*.json"],
    // One file is read per request, but the tracer needs the whole directory
    // named because the filename is only known at runtime from the id.
    // Named /api/opening-courses, not /api/courses: that path is already the
    // tactics course library on /courses, which is a different product.
    "/api/opening-courses": ["./src/data/courses/index.json"],
    "/api/opening-courses/[id]": ["./src/data/courses/**"],
    // One book per rating band, one file read per request. Glob, because the
    // band is only known at request time from the reader's own rating. Same
    // blind spot as every entry above: the tracer cannot see an fs read, and a
    // book it did not copy does not fail the build — /analysis simply reports
    // "no data for your band", in production only, which is precisely the
    // answer this feature must never give wrongly.
    "/api/book-exit": ["./src/data/opening-book.*.json"],
    // /learn/[courseId] reads its course in getServerSideProps and, since the
    // traps section, one trap file per band as well — both with `fs`.
    //
    // MEASURED, not assumed: without any entry the page already traced 44
    // course files, so the tracer does reach into src/data on its own here, the
    // same way it does for /api/master-ideas. This entry is belt-and-braces and
    // exists for the NEW trap files, whose presence was checked in
    // .next/server/pages/learn/[courseId].js.nft.json rather than hoped for. A
    // page missing its data renders a SHORTER page, never an error, so the
    // build and the deploy would both stay green.
    "/learn/[courseId]": ["./src/data/courses/**", "./src/data/traps.*.json"],
    // /puzzles/p/[id] is ISR with fallback:"blocking", so getStaticProps
    // reads the puzzle CSV at REQUEST time inside the serverless function —
    // unlike /puzzles/[rating] (fallback:false), whose CSV read happens at
    // build time and therefore needs no entry. Same blind spot as every
    // entry above: loadPuzzles.ts reads with `fs`, which the tracer cannot
    // see. There IS an HTTP fallback in loadCsvText(), so a missing trace
    // degrades to an 18MB self-fetch per cold start rather than an error —
    // slow enough to matter on a page whose whole job is landing traffic.
    "/puzzles/p/[id]": ["./public/data/lichess_puzzles_100k.csv"],
  },
  /**
   * Baseline hardening on every route, verified on the wire rather than
   * assumed present — the previous attempt at these was written into the
   * config nothing reads.
   *
   * Deliberately NOT included: Content-Security-Policy. This app loads
   * Stockfish WASM from /public, runs Web Workers, and renders third-party
   * embeds; a CSP written without measuring those would break the engine, and
   * a CSP loose enough to be safe by inspection would not be worth having.
   * That needs its own change with report-only telemetry first.
   */
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        // Clickjacking. The app has no legitimate embedder.
        { key: "X-Frame-Options", value: "DENY" },
        // Stop the browser second-guessing Content-Type — the vector that
        // turns a user-supplied upload into an executable script.
        { key: "X-Content-Type-Options", value: "nosniff" },
        // Send the full URL same-origin, origin-only cross-origin. Analysis
        // URLs carry FENs and share ids; those should not land in a third
        // party's referrer log.
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
        // Two years, subdomains included, preload-eligible. Vercel already
        // sends a bare max-age; this is the stricter form.
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ],
    },
  ],
  webpack: (config) => {
    // Handle Web Workers
    config.module.rules.push({
      test: /\.worker\.(js|ts)$/,
      use: { loader: 'worker-loader' },
    });

    // Handle WASM files
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Allow loading from CDN
    config.module.rules.push({
      test: /\.js$/,
      include: /node_modules\/stockfish\.js/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env'],
        },
      },
    });

    return config;
  },
};

module.exports = nextConfig;

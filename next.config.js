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
    // The tree, and the opening library that names the position at the top of
    // the Masters panel (src/lib/master/openingName.ts reads it with fs).
    "/api/opening-explorer": [
      "./src/data/master-tree.json",
      "./src/data/openings.json",
    ],
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
    // Masti's stills for the OG share cards (src/lib/og/masti.ts reads them
    // with fs, so the tracer cannot see them either).
    "/api/og/insight/[id]": ["./public/masti/v4/still/*.png"],
    "/api/og/game-share/[id]": ["./public/masti/v4/still/*.png"],
    "/api/og/scout/[id]": ["./public/masti/v4/still/*.png"],
    // The free-ai-chess-coach card is on the nodejs runtime for the same
    // reason: on the edge the bundled PNG took the function past Vercel's
    // 1 MB compressed limit and the deploy failed after the build.
    "/og/free-ai-chess-coach": ["./public/masti/v4/still/*.png"],
    "/og/home": ["./public/masti/v4/still/*.png"],
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
  /**
   * The partner preview links go out in email written as /partners/ChessUSA/1
   * and /partners/ChessHouse/1. Page routing is filesystem-based and
   * therefore case-SENSITIVE, so those exact strings 404 on the one audience
   * they were written for, and a dead link in a pitch is not something you
   * get to fix after they have clicked it.
   *
   * A rewrite, NOT a redirect. `source` patterns here are matched
   * case-INSENSITIVELY, so a redirect from the capitalised spelling also
   * matches the canonical lowercase one and sends it to itself — an infinite
   * loop that 307s every /partners/* route, including ones that worked
   * before. Measured, not theorised: that is exactly what the first version of
   * this did.
   *
   * Rewrites returned as a plain array run in `afterFiles`, i.e. only when no
   * page matched. So the lowercase path resolves to its page and never reaches
   * this rule, and only the capitalised spellings fall through to be rewritten
   * onto the canonical one. Canonical path stays lowercase.
   */
  rewrites: async () => [
    // ── Partner placement previews ──────────────────────────────────────────
    // /partners/ChessUSA/1/puzzles serves the REAL /puzzles page with that
    // advertiser's creative 2a in the slot below the nav. Any site path works,
    // and the advertiser and option are in the URL rather than in a cookie,
    // which is what makes the placement impossible to leak: a normal visitor
    // on /puzzles cannot end up in a state where the banner appears, because
    // there is no state.
    //
    // The advertiser list is an ALLOWLIST, spelled out here rather than left
    // as a wildcard :partner. A wildcard would make every /partners/<anything>
    // /1 URL serve the whole site under a noindex prefix, which is a large
    // open surface for the sake of saving one edit per sale. It is duplicated
    // from src/components/ads/partners.ts because this file is CommonJS and
    // cannot import it; partnerPrefix.test.ts reads this file as text and
    // fails if a registered advertiser has no rule here.
    //
    // Order matters — first match wins, and the ChessUSA catch-all below would
    // swallow these. The option rule is first.
    //
    // Casing is free: `source` patterns are matched case-INSENSITIVELY, so the
    // /partners/ChessUSA/... and /partners/ChessHouse/... spellings the links
    // go out as resolve here without rules of their own. (Page routing, by
    // contrast, is filesystem-based and case-sensitive, which is why these
    // need a rewrite at all. Do NOT turn them into redirects: a redirect from
    // the capitalised form also matches the lowercase one and 307-loops it
    // onto itself.)
    {
      source: "/partners/:partner(chessusa|chesshouse)/:option(1|2|3)/:path*",
      destination: "/:path*",
    },
    {
      source: "/partners/:partner(chessusa|chesshouse)/:option(1|2|3)",
      destination: "/",
    },
    // Casing no-op for the two real PAGES under this prefix,
    // /partners/chessusa and /partners/chessusa/live, so their capitalised
    // spellings resolve too. Runs in afterFiles, i.e. only when no page
    // matched, so the canonical lowercase paths reach their own pages and
    // never touch this. ChessUSA-only on purpose: it is the only advertiser
    // with an iframe shell. Chess House has the three links and nothing else,
    // so /partners/chesshouse with no option is a 404, as it should be.
    {
      source: "/partners/chessusa/:rest*",
      destination: "/partners/chessusa/:rest*",
    },
  ],
  headers: async () => [
    {
      /**
       * Everything EXCEPT the partner placement preview, which is the one
       * route with a legitimate embedder: its own shell at
       * /partners/chessusa frames it to show an advertiser their creative at
       * real viewport widths.
       *
       * Written as an exclusion rather than a second, narrower rule on
       * purpose. Next applies every matching rule, so a narrower rule would
       * leave TWO X-Frame-Options values on the response and make the
       * outcome depend on merge order. One rule, one value, per response.
       */
      source: "/((?!partners/chessusa/live).*)",
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
    {
      /**
       * Every URL under the preview prefix serves a REAL page of the site, so
       * /partners/ChessUSA/1/puzzles is a byte-for-byte duplicate of /puzzles
       * with one extra element. Three prefixes times every page on the site is
       * a large duplicate-content surface pointed straight at our own
       * canonical URLs, and it ships to production.
       *
       * noindex, not a robots.txt Disallow: a disallowed URL is never fetched,
       * so the crawler never sees the directive and the URL can still be
       * indexed from an inbound link — which is exactly what a link mailed to
       * an advertiser is. Let it crawl, and tell it no.
       *
       * Covers the shell and /live too, which are equally not for search.
       */
      source: "/partners/:path*",
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    },
    {
      /**
       * Masti the Monkey's art. The directory is versioned (/masti/v4/...)
       * and a new pack is a new directory, so every file under it is
       * immutable and can be cached for a year. The six animations are
       * 480-640 KB each; without this, every visit to /analysis would
       * re-download the coach's face. Built by scripts/masti/build-assets.mjs,
       * never hand-edited.
       */
      source: "/masti/:path*",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      /**
       * The one framable route. SAMEORIGIN, not ALLOWALL: the preview shell
       * is served from this same origin, so nothing outside chessmasti.com
       * gains the ability to frame the site. frame-ancestors 'self' says the
       * same thing to browsers that have dropped X-Frame-Options, and is the
       * directive that actually governs where X-Frame-Options is ignored.
       *
       * The rest of the hardening is repeated here because this route is
       * excluded from the rule above, and a security header you drop by
       * accident is worse than one you never had.
       */
      source: "/partners/chessusa/live",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
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

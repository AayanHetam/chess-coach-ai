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
    "/api/repertoire": ["./src/data/repertoire-map.json"],
    "/api/openings/search": ["./src/data/openings.json"],
    // One file is read per request, but the tracer needs the whole directory
    // named because the filename is only known at runtime from the id.
    // Named /api/opening-courses, not /api/courses: that path is already the
    // tactics course library on /courses, which is a different product.
    "/api/opening-courses": ["./src/data/courses/index.json"],
    "/api/opening-courses/[id]": ["./src/data/courses/**"],
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

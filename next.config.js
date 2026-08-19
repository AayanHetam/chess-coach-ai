/**
 * THIS is the config Next actually uses.
 *
 * `next.config.js` resolves ahead of `next.config.ts`, so while both files
 * exist this one wins and `next.config.ts` is inert — verified, not assumed:
 * neither production nor a local `next start` emits any of the `.ts` file's
 * COEP/COOP headers. Everything in `next.config.ts` (those headers, the
 * `outputFileTracingIncludes` for master-tree.json, the Sentry wrapper) has
 * therefore never taken effect.
 *
 * Deleting this file does NOT simply "clean up a duplicate" — it switches the
 * whole application onto a config that has never run. That was attempted here
 * and turned on site-wide `Cross-Origin-Embedder-Policy: require-corp`, which
 * hung /scout until its 60s test timeout.
 *
 * So: security headers belong HERE, in the live config, until someone
 * deliberately consolidates the two behind a real test pass. That is its own
 * piece of work, not a side effect of a security patch.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // Baseline hardening on every route: block framing (clickjacking), MIME
  // sniffing, and referrer leakage to third parties. Declared here rather than
  // in next.config.ts because only this file is read.
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
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

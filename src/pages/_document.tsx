import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />

        {/* Generic SEO meta. OG/Twitter tags are owned per-route by
         * pages/index.tsx, the PageTitle component (other Pages routes), and
         * Metadata exports (App Router). Don't add og:* / twitter:* here. */}
        <meta name="author" content="Chess Masti AI" />
        <meta
          name="keywords"
          content="chess masti, chess fun, chess ai, enjoyable chess, chess learning, chess training, fun chess coaching, chess improvement, chess enjoyment"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
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

        {/* SEO and Social Media Tags */}
        <meta
          name="description"
          content="Chess Masti AI - Make chess fun with AI-powered coaching! Learn through engaging principles-based feedback, enjoy the masti (fun) of improving your game, and discover the joy of chess mastery."
        />
        <meta
          name="keywords"
          content="chess masti, chess fun, chess ai, enjoyable chess, chess learning, chess training, fun chess coaching, chess improvement, chess enjoyment"
        />
        <meta name="author" content="Chess Masti AI" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="Chess Masti AI - Make Chess Fun with AI!"
        />
        <meta
          property="og:description"
          content="Make chess fun with AI-powered coaching! Learn through engaging principles and enjoy the masti (fun) of improving your game."
        />
        <meta property="og:site_name" content="Chess Masti AI" />
        <meta property="og:url" content="https://chess-masti-ai.com/" />
        <meta
          property="og:image"
          content="https://chess-masti-ai.com/social-networks-1200x630.png"
        />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Chess Masti AI - Make Chess Fun!" />
        <meta
          name="twitter:description"
          content="Make chess fun with AI-powered coaching! Learn through engaging principles and enjoy the masti of improving your game."
        />
        <meta name="twitter:domain" content="chess-masti-ai.com" />
        <meta name="twitter:url" content="https://chess-masti-ai.com/" />
        <meta name="twitter:creator" content="@ChessMastiAI" />
        <meta name="twitter:site" content="@ChessMastiAI" />
        <meta
          name="twitter:image"
          content="https://chess-masti-ai.com/social-networks-1200x630.png"
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

import { Head, Html, Main, NextScript } from "next/document";

import {
  partnerBootScript,
  partnerSlotCss,
} from "@/components/ads/PartnerSlot";

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

        {/* Generic SEO meta. OG/Twitter tags are owned per-route by
         * pages/index.tsx, the PageTitle component (other Pages routes), and
         * Metadata exports (App Router). Don't add og:* / twitter:* here. */}
        {/* Partner slot: reserve + un-hide, both before first paint.
         * The CSS is plain rather than MUI on purpose — this app has no
         * Emotion SSR on the Pages Router, so sx-generated rules do not exist
         * until hydration, which is far too late to reserve height. The script
         * is inline and head-blocking for the same reason. Together they are
         * what stop the banner shifting the page when it mounts.
         * A visitor without the cookie runs four statements and loads nothing:
         * no webfont, no artwork, no visible element. */}
        <style dangerouslySetInnerHTML={{ __html: partnerSlotCss }} />
        <script dangerouslySetInnerHTML={{ __html: partnerBootScript }} />

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

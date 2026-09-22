import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import ThemeRegistry from "@/components/ThemeRegistry";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import ConsentBanner from "@/components/consent/ConsentBanner";
import ConsentGatedAnalytics from "@/components/consent/ConsentGatedAnalytics";
import { SiteJsonLd } from "@/app/_seo/JsonLd";
import {
  partnerBootScript,
  partnerSlotCss,
} from "@/components/ads/PartnerSlot";
import { PartnerSlotApp } from "@/components/ads/PartnerSlotApp";

const inter = Inter({ subsets: ["latin"] });

const DESCRIPTION =
  "Free engine-first AI chess coach: Stockfish analysis, Claude explanations, validated chess claims, mistake-based puzzles, and opponent scouting.";

export const metadata: Metadata = {
  metadataBase: new URL("https://chessmasti.com"),
  title: {
    default: "Chess Masti AI — Free AI Chess Coach",
    template: "%s | Chess Masti AI",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    url: "https://chessmasti.com",
    siteName: "Chess Masti AI",
    title: "Chess Masti AI — Free AI Chess Coach",
    description: DESCRIPTION,
    images: [
      {
        url: "/og/home",
        width: 1200,
        height: 630,
        alt: "Meet Masti, the Chess Masti coach",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chess Masti AI — Free AI Chess Coach",
    description: DESCRIPTION,
    images: ["/og/home"],
  },
  // App Router pages render no _document, so the favicon links live here
  // too. Same files as src/pages/_document.tsx: Masti's face, built by
  // scripts/masti/build-brand-icons.mjs.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <SiteJsonLd />
        {/* Partner slot: reserve + un-hide, both before first paint. The CSS
            is plain rather than MUI so it exists at paint time, and the script
            is inline and head-blocking for the same reason — together they are
            what stop the banner shifting the page when it mounts. A visitor
            without the cookie runs four statements and loads nothing. */}
        <style dangerouslySetInnerHTML={{ __html: partnerSlotCss }} />
        <script dangerouslySetInnerHTML={{ __html: partnerBootScript }} />
      </head>
      <body className={inter.className}>
        <ThemeRegistry>
          {/* The App Router tree is the ~25 SEO landing pages. They render no
              NavPill, so the partner slot needs its own mount here to make the
              placement genuinely sitewide. Renders nothing unless the viewer
              opened one of the three /partners/chessusa/N links. */}
          <PartnerSlotApp />
          {children}
        </ThemeRegistry>
        {/* App Router pages don't pass through the Pages Router <Layout>, so
            without this the legal pages are reachable only by typing the URL.
            Light palette to match the .cm-content pages in _seo/styles.ts. */}
        <footer
          style={{
            borderTop: "1px solid #e5e5ea",
            padding: "24px 16px",
            display: "flex",
            gap: 20,
            flexWrap: "wrap",
            justifyContent: "center",
            fontSize: "0.82rem",
          }}
        >
          {[
            { href: "/", label: "Home" },
            { href: "/chess-basics", label: "Chess basics" },
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "/accessibility", label: "Accessibility" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{ color: "#888", textDecoration: "none" }}
            >
              {link.label}
            </a>
          ))}
        </footer>
        {/* Vercel Analytics + GA4, consent-gated (TRK-6): nothing loads
            until the visitor accepts analytics cookies. */}
        <ConsentGatedAnalytics />
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
        <ConsentBanner />
      </body>
    </html>
  );
}

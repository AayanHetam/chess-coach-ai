import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import ThemeRegistry from "@/components/ThemeRegistry";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import ConsentBanner from "@/components/consent/ConsentBanner";
import ConsentGatedAnalytics from "@/components/consent/ConsentGatedAnalytics";
import { SiteJsonLd } from "@/app/_seo/JsonLd";

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
        url: "/social-networks-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Chess Masti AI — Free AI Chess Coach",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chess Masti AI — Free AI Chess Coach",
    description: DESCRIPTION,
    images: ["/social-networks-1200x630.png"],
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
      </head>
      <body className={inter.className}>
        <ThemeRegistry>{children}</ThemeRegistry>
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

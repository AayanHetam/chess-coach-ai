import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { Suspense } from "react";
import ThemeRegistry from "@/components/ThemeRegistry";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import { SiteJsonLd } from "@/app/_seo/JsonLd";

const inter = Inter({ subsets: ["latin"] });

// Reuse the Firebase measurement ID — it IS a GA4 tag, no separate signup needed
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

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
        <Analytics />
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_MEASUREMENT_ID}', {
                  send_page_view: true
                });
              `}
            </Script>
          </>
        )}
        <Suspense fallback={null}>
          <AnalyticsProvider />
        </Suspense>
      </body>
    </html>
  );
}

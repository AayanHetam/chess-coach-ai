import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import Script from "next/script";
import { Suspense } from "react";
import ThemeRegistry from "@/components/ThemeRegistry";
import AnalyticsProvider from "@/components/AnalyticsProvider";

const inter = Inter({ subsets: ["latin"] });

// Reuse the Firebase measurement ID — it IS a GA4 tag, no separate signup needed
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

export const metadata: Metadata = {
  title: "Chess Masti AI — Free AI Chess Coach",
  description:
    "Free engine-first AI chess coach: Stockfish analysis, Claude explanations, validated chess claims, mistake-based puzzles, and opponent scouting.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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

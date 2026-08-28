"use client";

import { Analytics } from "@vercel/analytics/react";
import Script from "next/script";
import { useTrackingConsent } from "./useTrackingConsent";

// Reuse the Firebase measurement ID — it IS a GA4 tag, no separate signup
// needed. NEXT_PUBLIC_ vars are inlined at build time, so reading them in a
// client component is fine.
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;

/**
 * Third-party analytics (Vercel Analytics + the GA4 gtag script), mounted
 * ONLY once the visitor has accepted analytics cookies (TRK-6). Until then
 * this renders nothing, so no third-party request leaves the browser; when
 * the ConsentBanner records an "I agree" mid-session, the scripts mount then
 * — the gtag config fires its own page_view on load, so the accepting visit
 * is still counted.
 *
 * The privacy policy's Tracking-controls section describes exactly this
 * behavior; keep the two in sync.
 *
 * Mounted from BOTH routers (src/app/layout.tsx and src/pages/_app.tsx),
 * which is why this imports @vercel/analytics/react rather than the /next
 * flavor — the react build tracks history changes and works in either.
 */
export default function ConsentGatedAnalytics() {
  const consented = useTrackingConsent();

  if (!consented) return null;

  return (
    <>
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
    </>
  );
}

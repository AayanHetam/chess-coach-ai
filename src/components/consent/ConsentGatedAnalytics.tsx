"use client";

import { Analytics } from "@vercel/analytics/react";
import Script from "next/script";
import { useTrackingConsent } from "./useTrackingConsent";
import {
  PARTNER_PREVIEW_PATH_JS,
  isPartnerPreviewPath,
} from "@/components/ads/PartnerSlot";

// NEXT_PUBLIC_ vars are inlined at build time, so reading them in a client
// component is fine. The literal fallback is chessmasti.com's GA4 stream —
// measurement IDs are public (they ship in the page HTML), and neither
// NEXT_PUBLIC_GA_MEASUREMENT_ID nor NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID was
// ever set in the Vercel project, so without it GA never loaded at all.
const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
  "G-W5LHY620Q3";

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
/**
 * Drops Vercel Analytics events fired from the partner placement previews
 * under /partners/. Returning null means the event is never sent, so it costs
 * nothing against the plan's event allowance.
 *
 * Two reasons this matters rather than being tidiness: the project is close
 * to its event cap, and these previews are sent to advertisers, who will
 * reload them repeatedly. Counting that traffic would both burn the
 * allowance and inflate the very numbers we quote to the advertiser.
 *
 * This filter covers Vercel Analytics only. GA4, the Firestore visit log and
 * the Supabase tracker fire from AnalyticsProvider, which carries its own
 * matching guard — it needs one, because the previews are a URL prefix over
 * the whole site and a prefixed URL onto an App Router page reaches that
 * mount. An earlier version of this comment claimed they could not; that was
 * true only while the previews were Pages-Router-only routes.
 */
function dropPartnerPreview<T extends { url: string }>(event: T): T | null {
  try {
    if (isPartnerPreviewPath(new URL(event.url).pathname)) return null;
  } catch {
    // An unparseable URL is not a reason to drop a real page view.
  }
  return event;
}

export default function ConsentGatedAnalytics() {
  const consented = useTrackingConsent();

  if (!consented) return null;

  return (
    <>
      <Analytics beforeSend={dropPartnerPreview} />
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
                // GA4 sends an automatic page view from this config call, for
                // whatever URL the script loads on. That is a SECOND path into
                // GA4 alongside the manual event AnalyticsProvider fires, and
                // guarding only the manual one left advertiser reloads of
                // /partners/... inflating GA4 anyway. Suppress the automatic
                // one under the preview prefix; AnalyticsProvider sends the
                // real page views and carries the matching guard.
                send_page_view: !(${PARTNER_PREVIEW_PATH_JS})
              });
            `}
          </Script>
        </>
      )}
    </>
  );
}

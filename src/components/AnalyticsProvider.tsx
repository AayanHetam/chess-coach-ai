"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";
import { app } from "@/lib/firebase";
import { recordVisit } from "@/lib/visitorTracker";
import { track } from "@/lib/tracking/client";
import { clientHasConsent } from "@/lib/tracking/consent";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/**
 * Tracks page views on every client-side route change via:
 * 1. Google Analytics 4 (gtag.js) — direct, no sampling, every visitor counted
 * 2. Firebase Analytics — shares the same GA4 property via measurementId
 * 3. Custom Firestore visitor tracker — fully under our control
 *
 * The GA4 script tag is mounted by ConsentGatedAnalytics, post-consent only.
 * This component fires page_view events on SPA navigations.
 */
export default function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPath = useRef<string>("");

  useEffect(() => {
    if (!pathname) return;

    const url =
      pathname +
      (searchParams?.toString() ? `?${searchParams.toString()}` : "");

    // Deduplicate — don't re-track the same URL within the same render cycle
    if (url === lastTrackedPath.current) return;
    lastTrackedPath.current = url;

    // 1 + 2. GA4 gtag and Firebase Analytics page_views, consent-gated
    // (TRK-6). The gtag script only mounts post-consent (see
    // ConsentGatedAnalytics), so the window.gtag check alone would almost
    // suffice — but getAnalytics() would itself INITIALIZE Firebase Analytics
    // and set Google cookies, so both branches sit behind the explicit check.
    if (clientHasConsent()) {
      if (typeof window.gtag === "function") {
        window.gtag("event", "page_view", {
          page_path: url,
          page_title: document.title,
        });
      }

      isSupported().then((supported) => {
        if (supported && app && clientHasConsent()) {
          const analytics = getAnalytics(app);
          logEvent(analytics, "page_view", {
            page_path: url,
            page_title: document.title,
          });
        }
      });
    }

    // 3. Record to custom Firestore visitor tracker
    recordVisit(url);

    // 4. TRK-4: fire a page.view into the tracking warehouse (server-gated).
    // Custom analytics intentionally stores only the route path. Query values
    // and page titles can contain user-controlled or sensitive content.
    track("page.view", { path: pathname });
  }, [pathname, searchParams]);

  return null;
}

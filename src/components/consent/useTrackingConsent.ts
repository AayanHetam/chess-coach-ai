"use client";

import { useEffect, useState } from "react";
import {
  clientHasConsent,
  CONSENT_CHANGED_EVENT,
} from "@/lib/tracking/consent";

/**
 * Reactive view of the visitor's analytics choice: `cm_consent=accepted` and
 * no Global Privacy Control signal. Starts false (also what the server
 * renders, so no hydration mismatch), reads the cookie on mount, and flips
 * live when the ConsentBanner records a choice.
 */
export function useTrackingConsent(): boolean {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    const update = () => setConsented(clientHasConsent());
    update();
    window.addEventListener(CONSENT_CHANGED_EVENT, update);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, update);
  }, []);

  return consented;
}

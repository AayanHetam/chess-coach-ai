"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pushClient";

/**
 * Registers the push service worker once on app load (no-op if the browser
 * doesn't support service workers). Mounted app-wide in _app.tsx. Renders null.
 */
export default function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}

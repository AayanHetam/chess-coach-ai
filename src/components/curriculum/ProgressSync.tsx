"use client";

import { useProgressSync } from "@/lib/curriculum/useProgressSync";

/**
 * Mount point for the progress replica. Renders nothing — it exists so the
 * hook can live at the app root without _app.tsx having to become a client
 * component that calls hooks directly.
 */
export default function ProgressSync() {
  useProgressSync();
  return null;
}

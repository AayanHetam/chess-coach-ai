"use client";

import { usePathname } from "next/navigation";

import { PartnerSlot } from "./PartnerSlot";

/**
 * App Router binding for the partner slot, used by the ~25 SEO pages under
 * src/app. usePathname() gives the current path and re-renders on navigation,
 * which is what keeps the slot from surviving a client-side move out of the
 * preview prefix.
 *
 * Kept in its own file so next/navigation is never pulled into the Pages
 * Router bundle.
 */
export function PartnerSlotApp() {
  // tone="light": the App Router SEO pages render on a WHITE body, where
  // the dark-ground disclosure colour measures 1.00:1 and vanishes.
  return <PartnerSlot pathname={usePathname()} tone="light" />;
}

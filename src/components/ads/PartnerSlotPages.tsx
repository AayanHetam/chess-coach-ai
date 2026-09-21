"use client";

import { useRouter } from "next/router";

import { PartnerSlot } from "./PartnerSlot";

/**
 * Pages Router binding for the partner slot.
 *
 * `asPath` is the real browser URL, preview prefix included — a rewrite does
 * not change it — and it updates on every client-side navigation. That second
 * property is the one that matters: the boot script in _document only runs
 * once per DOCUMENT load, so a next/link click would otherwise leave the
 * banner on screen while the URL moved out of the prefix, putting an
 * unapproved advertisement on a real page.
 *
 * Kept in its own file so next/router is never pulled into the App Router
 * bundle, where calling it throws.
 */
export function PartnerSlotPages() {
  const router = useRouter();
  // asPath carries query and hash; the prefix test is on the path alone.
  const pathname = router.asPath.split("?")[0].split("#")[0];
  return <PartnerSlot pathname={pathname} />;
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { SlotTone } from "./PartnerBanner";
import {
  PAGE_SHELL_CLASS,
  PARTNER_SLOT_APP_CLASS,
  PartnerSlot,
  SLOT_TONE_ATTR,
  installAnchorRewriter,
  partnerPrefixOf,
  prefixPath,
} from "./PartnerSlot";

type AppRouter = ReturnType<typeof useRouter>;

const patched = new WeakSet<object>();

/**
 * On the App Router pages the prefix is kept with a full page load rather
 * than a client-side transition, for two reasons. This router's Link does not
 * go through router.push — it dispatches the navigation directly — so the
 * router cannot be wrapped the way the Pages one is, and the anchor rewriter
 * takes the click instead. And almost every link on these SEO pages points
 * into the Pages Router, which is a hard navigation anyway. The pages are
 * static, so the load is cheap. push and replace get the same treatment so
 * the one form here (/internship/apply) lands under the prefix too. Returns
 * the undo.
 */
export function patchAppRouter(
  router: AppRouter,
  prefix: string,
  origin: string,
  navigate: (href: string, replace: boolean) => void
): () => void {
  if (patched.has(router)) return () => {};
  patched.add(router);
  const original = { push: router.push, replace: router.replace };
  router.push = (href) => navigate(prefixPath(prefix, href, origin), false);
  router.replace = (href) => navigate(prefixPath(prefix, href, origin), true);
  return () => {
    router.push = original.push;
    router.replace = original.replace;
    patched.delete(router);
  };
}

/**
 * App Router binding for the partner slot, used by the ~25 SEO pages under
 * src/app. usePathname() gives the current path and re-renders on navigation,
 * which is what keeps the slot from surviving a client-side move out of the
 * preview prefix. Under a prefix it installs the router wrapper above and the
 * anchor rewriter, and undoes both on the way out.
 *
 * Kept in its own file so next/navigation is never pulled into the Pages
 * Router bundle.
 */
export function PartnerSlotApp() {
  const pathname = usePathname();
  const router = useRouter();
  const prefix = pathname ? partnerPrefixOf(pathname) : null;
  useEffect(() => {
    if (!prefix) return;
    const go = (href: string, replace: boolean) =>
      replace ? window.location.replace(href) : window.location.assign(href);
    const unpatch = patchAppRouter(router, prefix, window.location.origin, go);
    const uninstall = installAnchorRewriter(prefix, (href) => go(href, false));
    return () => {
      unpatch();
      uninstall();
    };
  }, [router, prefix]);
  /**
   * The disclosure's colour follows the page's ground: dark under the SEO
   * pages' PageShell, light above every other App Router page, which keeps
   * the white body. Read from the DOM after mount, the same signal the
   * wrapper's CSS keys on (see PARTNER_SLOT_APP_CLASS), which is safe
   * because the slot renders nothing until mounted anyway. The tone is also
   * stamped on the wrapper so its ground and the label can never disagree,
   * :has() support or not.
   */
  const [tone, setTone] = useState<SlotTone | null>(null);
  useEffect(() => {
    setTone(document.querySelector(`.${PAGE_SHELL_CLASS}`) ? "dark" : "light");
  }, [pathname]);
  // No stamp until the tone is known: a guessed value rendered on the server
  // would outrank the :has() rule on the first frame and paint the band the
  // wrong colour until hydration.
  return (
    <div
      className={PARTNER_SLOT_APP_CLASS}
      {...(tone ? { [SLOT_TONE_ATTR]: tone } : {})}
    >
      <PartnerSlot pathname={pathname} tone={tone ?? "light"} />
    </div>
  );
}

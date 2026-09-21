"use client";

import { resolveHref } from "next/dist/client/resolve-href";
import Router, { useRouter, type NextRouter } from "next/router";
import { useEffect } from "react";

import {
  PartnerSlot,
  installAnchorRewriter,
  partnerPrefixOf,
  prefixPath,
} from "./PartnerSlot";

type Url = Parameters<NextRouter["push"]>[0];

/**
 * What the URL bar should show after router.push(url, as): the destination
 * Next itself would have shown, with the prefix in front. resolveHref is
 * Next's own resolver — prepareUrlAs makes the same call — so every argument
 * shape a caller can pass (a string, a URL object, a dynamic pattern plus
 * `as`, a query-only or hash-only href) comes out exactly as Next would
 * display it, and the prefix is the only part that is ours.
 */
export function prefixedAs(
  router: NextRouter,
  prefix: string,
  origin: string,
  url: Url,
  as?: Url
): string {
  let destination: string;
  if (as == null) {
    const [href, interpolated] = resolveHref(router, url, true);
    destination = interpolated ?? href;
  } else {
    destination = resolveHref(router, as);
  }
  return prefixPath(prefix, destination, origin);
}

const patched = new WeakSet<object>();

/**
 * Makes every push and replace on this router keep the prefix. next/link
 * navigates through these two methods and so do the fifty-odd programmatic
 * router.push("/plan") calls across the product, so this one seam covers
 * both. The href — the page Next loads — is left alone: the rewrite in
 * next.config maps the prefixed `as` back onto it on the client exactly as it
 * does on the server. Returns the undo.
 *
 * Patch the underlying Router INSTANCE (`Router.router`), not the object
 * useRouter() returns. That object is a fresh public copy on every render of
 * Next's AppContainer, and its methods delegate to the instance at call
 * time — so a patch on the instance reaches useRouter(), next/link and the
 * singleton `Router.push` alike, and survives every re-render. A patch on
 * the copy reached none of the programmatic callers and was silently lost.
 */
export function patchPagesRouter(
  router: NextRouter,
  prefix: string,
  origin: string
): () => void {
  if (patched.has(router)) return () => {};
  patched.add(router);
  const original = { push: router.push, replace: router.replace };
  router.push = (url, as, options) =>
    original.push.call(
      router,
      url,
      prefixedAs(router, prefix, origin, url, as),
      options
    );
  router.replace = (url, as, options) =>
    original.replace.call(
      router,
      url,
      prefixedAs(router, prefix, origin, url, as),
      options
    );
  return () => {
    router.push = original.push;
    router.replace = original.replace;
    patched.delete(router);
  };
}

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
 * Under a prefix it also installs the two things that keep the prefix on the
 * next navigation — the router wrapper above and the anchor rewriter — and
 * undoes both when the URL leaves the prefix or the slot unmounts.
 *
 * Kept in its own file so next/router is never pulled into the App Router
 * bundle, where calling it throws.
 */
export function PartnerSlotPages() {
  const router = useRouter();
  // asPath carries query and hash; the prefix test is on the path alone.
  const pathname = router.asPath.split("?")[0].split("#")[0];
  const prefix = partnerPrefixOf(pathname);
  useEffect(() => {
    const instance = Router.router;
    if (!prefix || !instance) return;
    const unpatch = patchPagesRouter(instance, prefix, window.location.origin);
    const uninstall = installAnchorRewriter(prefix);
    return () => {
      unpatch();
      uninstall();
    };
  }, [prefix]);
  return <PartnerSlot pathname={pathname} />;
}

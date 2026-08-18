/**
 * Require browser provenance for cookie-authenticated, side-effecting requests.
 *
 * Modern browsers send both Origin and Sec-Fetch-Site on same-origin POSTs.
 * Requiring one trustworthy same-origin signal prevents another site from
 * spending an administrator's authenticated session on a provider probe.
 */
export function isSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin") return false;

  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  // Some clients omit Origin but still provide Fetch Metadata. Accept only the
  // browser's explicit same-origin assertion; missing provenance is rejected.
  return fetchSite === "same-origin";
}

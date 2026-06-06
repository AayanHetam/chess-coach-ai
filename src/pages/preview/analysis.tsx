import type { GetServerSideProps } from "next";

/**
 * /preview/analysis — server-side 308 redirect to /analysis after the
 * cutover (2026-06-04). The dark-glass implementation that used to live
 * here is now the canonical /analysis surface.
 *
 * 308 preserves the request method and is permanent — search engines +
 * AI crawlers will treat /analysis as the new canonical URL. Query string
 * is preserved verbatim so deep links (?gameId=, ?insightId=, ?pgn=,
 * ?autoAnalyze=1, etc.) all keep working.
 *
 * Kept as a redirect (not deleted) for 30+ days because:
 *   - The Chrome Extension and external pasted links target /preview/analysis
 *     historically; deleting would 404 them.
 *   - Existing share-card URLs may reference /preview/analysis until they
 *     expire from caches (Twitter/LinkedIn unfurl, Discord embed caches).
 */

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const queryString = ctx.req.url?.split("?")[1] ?? "";
  const destination = queryString ? `/analysis?${queryString}` : "/analysis";
  return {
    redirect: {
      destination,
      permanent: true,
    },
  };
};

// Required by Next.js even though we never render — getServerSideProps
// always returns a redirect.
export default function PreviewAnalysisRedirect() {
  return null;
}

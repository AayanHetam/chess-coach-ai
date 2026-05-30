// 2026-05-30 cutover: /preview/analysis is no longer a distinct surface.
// The implementation now lives at the canonical /analysis route. We keep
// this file as a server-side redirect so external links and shared
// snippet URLs that target /preview/analysis continue to resolve. Query
// params are forwarded verbatim so ?puzzleFen=, ?pgn=, ?insightId=, etc.
// survive the redirect.
import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const sourceUrl = req.url ?? "/preview/analysis";
  const queryIndex = sourceUrl.indexOf("?");
  const search = queryIndex >= 0 ? sourceUrl.slice(queryIndex) : "";
  return {
    redirect: {
      destination: `/analysis${search}`,
      permanent: true,
    },
  };
};

export default function PreviewAnalysisRedirect() {
  return null;
}
